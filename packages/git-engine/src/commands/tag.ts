import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import {
  DEFAULT_AUTHOR,
  type GitTagCreateOptions,
  type GitTagListOptions,
  type GitTagResult,
} from "../engine/git-engine";
import { readTags } from "../engine/refs";
import {
  currentBranch,
  isRepository,
  resolveRefOrNull,
  shortOid,
  subject,
} from "../engine/repository";
import { resolveRevision } from "../engine/revisions";
import { isValidBranchName } from "./branch";

export const TAG_USAGE =
  "usage: git tag [-l [<pattern>]] [-n]\n   or: git tag [-a -m <message>] <tagname> [<commit>]\n   or: git tag -d <tagname>";

/** Tag names follow the same check-ref-format rules as branch names. */
export function isValidTagName(name: string): boolean {
  return isValidBranchName(name);
}

/**
 * `*` and `?` globs, as `git tag -l 'v1.*'` matches them. Hand-written rather than compiled to a
 * regular expression: a pattern such as `*a*a*a*b` becomes a backtracking `.*a.*a.*a.*b`, which
 * is polynomial in the name's length. This greedy matcher backtracks only to the last `*`.
 */
export function matchesGlob(pattern: string, name: string): boolean {
  let p = 0;
  let n = 0;
  let star = -1;
  let resume = 0;
  while (n < name.length) {
    if (p < pattern.length && (pattern[p] === "?" || pattern[p] === name[n])) {
      p += 1;
      n += 1;
    } else if (p < pattern.length && pattern[p] === "*") {
      star = p;
      resume = n;
      p += 1;
    } else if (star !== -1) {
      p = star + 1;
      resume += 1;
      n = resume;
    } else {
      return false;
    }
  }
  while (pattern[p] === "*") p += 1;
  return p === pattern.length;
}

/** `git tag`, `git tag -l [<pattern>]` and `git tag -n`. */
export async function runListTags(
  ctx: GitContext,
  { pattern, annotations = false }: GitTagListOptions = {},
): Promise<GitTagResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const tags = (await readTags(ctx)).filter(
    (tag) => pattern === undefined || matchesGlob(pattern, tag.name),
  );
  if (!annotations) return success(tags.map((tag) => tag.name).join("\n"), { tags });
  // `-n` shows the first line of each annotation; lightweight tags show their commit's subject.
  const width = Math.max(15, ...tags.map((tag) => tag.name.length));
  const lines = await Promise.all(
    tags.map(async (tag) => {
      const text =
        tag.message ??
        (await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid: tag.oid })).commit.message;
      return `${tag.name.padEnd(width)} ${subject(text)}`;
    }),
  );
  return success(lines.join("\n"), { tags });
}

/** `git tag <name> [<commit>]` and `git tag -a <name> -m <message> [<commit>]`. */
export async function runCreateTag(
  ctx: GitContext,
  name: string,
  { target, message, annotated = false }: GitTagCreateOptions = {},
): Promise<GitTagResult> {
  if (!(await isRepository(ctx))) return notARepository();
  if (!isValidTagName(name)) {
    return failure(gitError("INVALID_TAG_NAME", `fatal: '${name}' is not a valid tag name.`));
  }
  if ((await resolveRefOrNull(ctx, `refs/tags/${name}`)) !== null) {
    return failure(gitError("TAG_EXISTS", `fatal: tag '${name}' already exists`));
  }
  const oid =
    target === undefined ? await resolveRefOrNull(ctx, "HEAD") : await resolveRevision(ctx, target);
  if (oid === null) {
    if (target !== undefined) {
      return failure(
        gitError("INVALID_REVISION", `fatal: Failed to resolve '${target}' as a valid ref.`),
      );
    }
    const branch = (await currentBranch(ctx)) ?? "HEAD";
    return failure(
      gitError(
        "NO_COMMITS",
        `fatal: Failed to resolve 'HEAD' as a valid ref.\nhint: '${branch}' has no commits yet.`,
      ),
    );
  }
  // Real Git would open an editor for `-a` without `-m`; GitDojo asks for the message up front.
  if (annotated && (message === undefined || message.trim() === "")) {
    return failure(
      gitError(
        "INVALID_ARGUMENT",
        'fatal: an annotated tag needs a message: git tag -a <name> -m "<message>"\nhint: GitDojo does not open an editor for tag messages.',
      ),
    );
  }

  if (message !== undefined) {
    // `-m` alone implies `-a`, as in Git.
    await git.annotatedTag({
      fs: ctx.fs,
      dir: ctx.dir,
      ref: name,
      object: oid,
      message: message.endsWith("\n") ? message : `${message}\n`,
      tagger: DEFAULT_AUTHOR,
    });
  } else {
    await git.tag({ fs: ctx.fs, dir: ctx.dir, ref: name, object: oid });
  }
  // Real `git tag <name>` is silent on success.
  return success("", { tags: (await readTags(ctx)).filter((tag) => tag.name === name) });
}

/** `git tag -d <name>`. */
export async function runDeleteTag(ctx: GitContext, name: string): Promise<GitTagResult> {
  if (name === "")
    return failure(gitError("INVALID_ARGUMENT", `fatal: tag name required\n${TAG_USAGE}`));
  if (!(await isRepository(ctx))) return notARepository();
  const ref = isValidTagName(name) ? await resolveRefOrNull(ctx, `refs/tags/${name}`) : null;
  if (ref === null) {
    return failure(gitError("TAG_NOT_FOUND", `error: tag '${name}' not found.`));
  }
  const tags = (await readTags(ctx)).filter((tag) => tag.name === name);
  await git.deleteTag({ fs: ctx.fs, dir: ctx.dir, ref: name });
  // Git reports the tag object's id for an annotated tag, the commit's for a lightweight one.
  return success(`Deleted tag '${name}' (was ${shortOid(ref)})`, { tags });
}
