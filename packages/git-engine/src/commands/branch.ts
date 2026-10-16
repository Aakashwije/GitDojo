import { type BranchState, type GitEngineError } from "@gitdojo/shared-types";
import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import {
  type GitBranchCreateResult,
  type GitBranchDeleteResult,
  type GitBranchListResult,
  type GitShowBranchesOptions,
  type GitUpstreamInfo,
} from "../engine/git-engine";
import {
  clearUpstreamConfig,
  readRemoteTrackingBranches,
  resolveCommitRef,
  upstreamInfo,
  writeUpstreamConfig,
} from "../engine/refs";
import { deleteReflog, logBranchMove } from "../engine/reflog";
import {
  createCommitCache,
  currentBranch,
  isAncestor,
  isRepository,
  resolveRefOrNull,
  shortOid,
  subject,
} from "../engine/repository";
import { resolveRevision } from "../engine/revisions";

// Git's check-ref-format rules, applied to a branch name.
const FORBIDDEN_CHARACTERS = /[\s~^:?*[\\]/;

function hasControlCharacter(name: string): boolean {
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** True when Git would accept `name` as a branch name. */
export function isValidBranchName(name: string): boolean {
  if (name === "" || name === "HEAD" || name === "@" || name.startsWith("-")) return false;
  if (FORBIDDEN_CHARACTERS.test(name) || hasControlCharacter(name)) return false;
  if (name.includes("..") || name.includes("@{") || name.includes("//")) return false;
  if (name.startsWith("/") || name.endsWith("/") || name.endsWith(".")) return false;
  return name
    .split("/")
    .every((component) => !component.startsWith(".") && !component.endsWith(".lock"));
}

function byName(a: BranchState, b: BranchState): number {
  if (a.name === b.name) return 0;
  return a.name < b.name ? -1 : 1;
}

/** Every branch with the commit it points to. The current branch is included even when unborn. */
export async function readBranches(ctx: GitContext): Promise<BranchState[]> {
  if (!(await isRepository(ctx))) return [];
  const [current, names] = await Promise.all([
    currentBranch(ctx),
    git.listBranches({ fs: ctx.fs, dir: ctx.dir }),
  ]);
  const cache = createCommitCache();
  const branches: BranchState[] = await Promise.all(
    names.map(async (name) => {
      const oid = await resolveRefOrNull(ctx, `refs/heads/${name}`);
      const upstream = await upstreamInfo(ctx, name, oid, cache);
      return { name, oid, current: name === current, ...(upstream ? { upstream } : {}) };
    }),
  );
  if (current !== null && !names.includes(current)) {
    branches.push({ name: current, oid: null, current: true });
  }
  return branches.sort(byName);
}

/** `[origin/main: ahead 1, behind 2]`, as `git branch -vv` prints it. */
function upstreamLabel(upstream: GitUpstreamInfo): string {
  if (upstream.gone) return `[${upstream.name}: gone]`;
  const parts = [
    ...(upstream.ahead > 0 ? [`ahead ${String(upstream.ahead)}`] : []),
    ...(upstream.behind > 0 ? [`behind ${String(upstream.behind)}`] : []),
  ];
  return parts.length === 0 ? `[${upstream.name}]` : `[${upstream.name}: ${parts.join(", ")}]`;
}

async function commitSubject(ctx: GitContext, oid: string): Promise<string> {
  return subject((await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid })).commit.message);
}

export async function runShowBranches(
  ctx: GitContext,
  { remotes = false, all = false, verbose = false }: GitShowBranchesOptions = {},
): Promise<GitBranchListResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const branches = await readBranches(ctx);
  const head = await resolveRefOrNull(ctx, "HEAD");
  // Like Git, an unborn branch is not listed: it does not exist until its first commit.
  const rows: { marker: string; name: string; oid: string; upstream?: GitUpstreamInfo }[] = [];
  if (!remotes) {
    if (head !== null && !branches.some((branch) => branch.current)) {
      rows.push({ marker: "*", name: `(HEAD detached at ${shortOid(head)})`, oid: head });
    }
    for (const branch of branches) {
      if (branch.oid === null) continue;
      rows.push({
        marker: branch.current ? "*" : " ",
        name: branch.name,
        oid: branch.oid,
        ...(branch.upstream ? { upstream: branch.upstream } : {}),
      });
    }
  }
  if (remotes || all) {
    for (const ref of await readRemoteTrackingBranches(ctx)) {
      rows.push({ marker: " ", name: all ? `remotes/${ref.name}` : ref.name, oid: ref.oid });
    }
  }
  if (!verbose) {
    return success(rows.map((row) => `${row.marker} ${row.name}`).join("\n"), { branches });
  }
  const width = Math.max(0, ...rows.map((row) => row.name.length));
  const lines = await Promise.all(
    rows.map(async (row) => {
      const tracking = row.upstream ? `${upstreamLabel(row.upstream)} ` : "";
      const text = await commitSubject(ctx, row.oid);
      return `${row.marker} ${row.name.padEnd(width)} ${shortOid(row.oid)} ${tracking}${text}`;
    }),
  );
  return success(lines.join("\n"), { branches });
}

/** Why a new branch called `name` cannot be created, or `null` when the name is free. */
export async function newBranchNameError(
  ctx: GitContext,
  name: string,
): Promise<GitEngineError | null> {
  if (!isValidBranchName(name)) {
    return gitError("INVALID_BRANCH_NAME", `fatal: '${name}' is not a valid branch name`);
  }
  const existing = await git.listBranches({ fs: ctx.fs, dir: ctx.dir });
  if (existing.includes(name)) {
    return gitError("BRANCH_EXISTS", `fatal: a branch named '${name}' already exists`);
  }
  // Branches are files under .git/refs/heads, so `feature` and `feature/login` cannot coexist.
  const clash = existing.find(
    (branch) => branch.startsWith(`${name}/`) || name.startsWith(`${branch}/`),
  );
  if (clash !== undefined) {
    return gitError(
      "BRANCH_EXISTS",
      `fatal: cannot create branch '${name}': a branch named '${clash}' already exists`,
    );
  }
  return null;
}

export async function runCreateBranch(
  ctx: GitContext,
  name: string,
  startPoint?: string,
): Promise<GitBranchCreateResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const nameError = await newBranchNameError(ctx, name);
  if (nameError) return failure(nameError);

  const start =
    startPoint === undefined
      ? await resolveRefOrNull(ctx, "HEAD")
      : await resolveRevision(ctx, startPoint);
  if (start === null) {
    if (startPoint !== undefined) {
      return failure(
        gitError("INVALID_REVISION", `fatal: not a valid object name: '${startPoint}'`),
      );
    }
    // A branch has to point at a commit, and an unborn branch has none yet.
    const branch = (await currentBranch(ctx)) ?? "HEAD";
    return failure(gitError("NO_COMMITS", `fatal: not a valid object name: '${branch}'`));
  }

  await git.branch({ fs: ctx.fs, dir: ctx.dir, ref: name, object: start });
  await logBranchMove(ctx, name, {
    from: null,
    to: start,
    message: `branch: Created from ${startPoint ?? "HEAD"}`,
  });
  // Started from `origin/x`: the new branch tracks it, as with Git's default autoSetupMerge.
  const tracking =
    startPoint !== undefined &&
    (await resolveRefOrNull(ctx, `refs/heads/${startPoint}`)) === null &&
    (await resolveCommitRef(ctx, `refs/tags/${startPoint}`)) === null
      ? (await readRemoteTrackingBranches(ctx)).find((ref) => ref.name === startPoint)
      : undefined;
  if (tracking) {
    await writeUpstreamConfig(ctx, name, tracking.remote, tracking.branch);
    return success(`branch '${name}' set up to track '${tracking.name}'.`, { name, oid: start });
  }
  // Real `git branch <name>` is silent on success.
  return success("", { name, oid: start });
}

/** `git branch -d <name>` and, with `force`, `git branch -D <name>`. */
export async function runDeleteBranch(
  ctx: GitContext,
  name: string,
  { force = false }: { force?: boolean } = {},
): Promise<GitBranchDeleteResult> {
  if (name === "") return failure(gitError("INVALID_ARGUMENT", "fatal: branch name required"));
  if (!(await isRepository(ctx))) return notARepository();
  const oid = isValidBranchName(name) ? await resolveRefOrNull(ctx, `refs/heads/${name}`) : null;
  if (oid === null) {
    return failure(gitError("BRANCH_NOT_FOUND", `error: branch '${name}' not found`));
  }
  if ((await currentBranch(ctx)) === name) {
    return failure(
      gitError(
        "BRANCH_CHECKED_OUT",
        `error: cannot delete branch '${name}' used by worktree at '${ctx.displayDir}'`,
      ),
    );
  }
  const head = await resolveRefOrNull(ctx, "HEAD");
  // -d protects work: the branch's commits must already be part of HEAD.
  if (!force && (head === null || !(await isAncestor(ctx, oid, head)))) {
    return failure(
      gitError(
        "BRANCH_NOT_MERGED",
        `error: the branch '${name}' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D ${name}'.`,
      ),
    );
  }
  await git.deleteBranch({ fs: ctx.fs, dir: ctx.dir, ref: name });
  await deleteReflog(ctx, name);
  await clearUpstreamConfig(ctx, name);
  return success(`Deleted branch ${name} (was ${shortOid(oid)}).`, { name, oid });
}
