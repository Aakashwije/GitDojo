import git from "isomorphic-git";
import { hasErrorCode } from "../filesystem/fs-errors";
import { type GitContext } from "./context";
import { reflogEntry } from "./reflog";
import { resolveRefOrNull } from "./repository";

const FULL_OID = /^[0-9a-f]{40}$/;
const SHORT_OID = /^[0-9a-f]{4,39}$/;
// <base>, then any number of ~N / ^N suffixes.
const REVISION = /^(.+?)((?:[~^]\d*)*)$/;
// HEAD@{2}, main@{1}, @{1}
const REFLOG = /^(.*)@\{(\d+)\}$/;

async function commitExists(ctx: GitContext, oid: string): Promise<boolean> {
  try {
    await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid });
    return true;
  } catch (error) {
    // Unknown, or a blob or tree rather than a commit.
    if (hasErrorCode(error, "NotFoundError") || hasErrorCode(error, "ObjectTypeError")) {
      return false;
    }
    throw error;
  }
}

async function parentsOf(ctx: GitContext, oid: string): Promise<string[]> {
  return (await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid })).commit.parent;
}

async function resolveBase(ctx: GitContext, base: string): Promise<string | null> {
  const reflog = REFLOG.exec(base);
  if (reflog) {
    const [, ref = "", index = "0"] = reflog;
    return reflogEntry(ctx, ref === "" || ref === "@" ? "HEAD" : ref, Number(index));
  }
  if (base === "HEAD" || base === "@") return resolveRefOrNull(ctx, "HEAD");
  if (!base.startsWith("refs/")) {
    const branch = await resolveRefOrNull(ctx, `refs/heads/${base}`);
    if (branch !== null) return branch;
  } else {
    const ref = await resolveRefOrNull(ctx, base);
    if (ref !== null) return ref;
  }
  if (FULL_OID.test(base)) return (await commitExists(ctx, base)) ? base : null;
  if (SHORT_OID.test(base)) {
    try {
      const oid = await git.expandOid({ fs: ctx.fs, dir: ctx.dir, oid: base });
      return (await commitExists(ctx, oid)) ? oid : null;
    } catch (error) {
      // Ambiguous or unknown abbreviations both mean "no such revision" to the learner.
      if (hasErrorCode(error, "NotFoundError") || hasErrorCode(error, "AmbiguousError"))
        return null;
      throw error;
    }
  }
  return null;
}

/**
 * Resolves the revision syntax learners meet in tutorials to a commit oid:
 *
 * - `HEAD` / `@`, a branch name, a full or abbreviated (4+ characters) commit id;
 * - `~N` (Nth first-parent ancestor), `^` / `^N` (Nth parent), in any combination: `HEAD~2^2`;
 * - reflog positions: `HEAD@{1}`, `main@{2}`.
 *
 * Returns `null` when the revision does not name a commit, so each command can report it with
 * Git's own wording for that command.
 */
export async function resolveRevision(ctx: GitContext, revision: string): Promise<string | null> {
  const match = REVISION.exec(revision.trim());
  if (!match) return null;
  const [, base = "", suffixes = ""] = match;
  let oid = await resolveBase(ctx, base);

  for (const [, operator, digits] of suffixes.matchAll(/([~^])(\d*)/g)) {
    if (oid === null) return null;
    const count = digits === "" || digits === undefined ? 1 : Number(digits);
    if (operator === "^") {
      if (count === 0) continue;
      oid = (await parentsOf(ctx, oid))[count - 1] ?? null;
      continue;
    }
    for (let step = 0; step < count && oid !== null; step += 1) {
      oid = (await parentsOf(ctx, oid))[0] ?? null;
    }
  }
  return oid;
}

/** Git's error for an unknown revision in commands such as `git reset`. */
export function unknownRevisionMessage(revision: string): string {
  return `fatal: ambiguous argument '${revision}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`;
}
