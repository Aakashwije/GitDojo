import { type BranchState, type GitEngineError } from "@gitdojo/shared-types";
import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitBranchCreateResult, type GitBranchListResult } from "../engine/git-engine";
import { currentBranch, isRepository, resolveRefOrNull } from "../engine/repository";

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
  const branches: BranchState[] = await Promise.all(
    names.map(async (name) => ({
      name,
      oid: await resolveRefOrNull(ctx, `refs/heads/${name}`),
      current: name === current,
    })),
  );
  if (current !== null && !names.includes(current)) {
    branches.push({ name: current, oid: null, current: true });
  }
  return branches.sort(byName);
}

export async function runShowBranches(ctx: GitContext): Promise<GitBranchListResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const branches = await readBranches(ctx);
  // Like Git, an unborn branch is not listed: it does not exist until its first commit.
  const output = branches
    .filter((branch) => branch.oid !== null)
    .map((branch) => `${branch.current ? "*" : " "} ${branch.name}`)
    .join("\n");
  return success(output, { branches });
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
): Promise<GitBranchCreateResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const nameError = await newBranchNameError(ctx, name);
  if (nameError) return failure(nameError);

  const head = await resolveRefOrNull(ctx, "HEAD");
  if (head === null) {
    // A branch has to point at a commit, and an unborn branch has none yet.
    const branch = (await currentBranch(ctx)) ?? "HEAD";
    return failure(gitError("NO_COMMITS", `fatal: not a valid object name: '${branch}'`));
  }

  await git.branch({ fs: ctx.fs, dir: ctx.dir, ref: name, object: head });
  // Real `git branch <name>` is silent on success.
  return success("", { name, oid: head });
}
