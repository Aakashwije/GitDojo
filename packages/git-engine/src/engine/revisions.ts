import git from "isomorphic-git";
import { hasErrorCode } from "../filesystem/fs-errors";
import { type GitContext } from "./context";
import { reflogEntry } from "./reflog";
import { resolveCommitRef } from "./refs";
import { resolveRefOrNull } from "./repository";

const FULL_OID = /^[0-9a-f]{40}$/;
const SHORT_OID = /^[0-9a-f]{4,39}$/;
const DIGITS = /^\d+$/;

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

/** One `~N` or `^N` step after the base; `count` is 1 when no number is given. */
export interface RevisionStep {
  operator: "~" | "^";
  count: number;
}

/**
 * Splits `HEAD~2^2` into its base (`HEAD`) and steps (`~2`, `^2`), or `null` without a base.
 *
 * Hand-written and linear on purpose: a regular expression such as `^(.+?)((?:[~^]\d*)*)$`
 * backtracks quadratically on input like `a^9^9^9^...!`, and revisions are typed by the learner.
 * The steps are the longest tail made only of `~`, `^` and digits that starts with `~` or `^`,
 * so digits that end a commit id (`abc1234~2`) stay part of the base.
 */
export function parseRevision(revision: string): { base: string; steps: RevisionStep[] } | null {
  let start = revision.length;
  while (start > 0) {
    const char = revision[start - 1];
    if (char !== "~" && char !== "^" && !isDigit(char)) break;
    start -= 1;
  }
  while (start < revision.length && isDigit(revision[start])) start += 1;
  const base = revision.slice(0, start);
  if (base === "") return null;

  const steps: RevisionStep[] = [];
  for (let index = start; index < revision.length;) {
    const operator = revision[index] === "~" ? "~" : "^";
    let end = index + 1;
    while (isDigit(revision[end])) end += 1;
    const digits = revision.slice(index + 1, end);
    steps.push({ operator, count: digits === "" ? 1 : Number(digits) });
    index = end;
  }
  return { base, steps };
}

/** `HEAD@{2}`, `main@{1}`, `@{1}`: the ref (`""` for `@{n}`) and the position, or `null`. */
export function parseReflogSelector(base: string): { ref: string; index: number } | null {
  if (!base.endsWith("}")) return null;
  const open = base.lastIndexOf("@{");
  if (open === -1) return null;
  const digits = base.slice(open + 2, -1);
  return DIGITS.test(digits) ? { ref: base.slice(0, open), index: Number(digits) } : null;
}

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
  const reflog = parseReflogSelector(base);
  if (reflog) {
    const { ref, index } = reflog;
    return reflogEntry(ctx, ref === "" || ref === "@" ? "HEAD" : ref, index);
  }
  if (base === "HEAD" || base === "@") return resolveRefOrNull(ctx, "HEAD");
  if (!base.startsWith("refs/")) {
    // Git's order: tags, then branches, then remote-tracking branches (`origin/main`).
    for (const prefix of ["refs/tags/", "refs/heads/", "refs/remotes/"]) {
      const ref = await resolveCommitRef(ctx, `${prefix}${base}`);
      if (ref !== null) return ref;
    }
  } else {
    const ref = await resolveCommitRef(ctx, base);
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
 * - `HEAD` / `@`, a tag, a branch or remote-tracking branch (`origin/main`) name, a full or
 *   abbreviated (4+ characters) commit id;
 * - `~N` (Nth first-parent ancestor), `^` / `^N` (Nth parent), in any combination: `HEAD~2^2`;
 * - reflog positions: `HEAD@{1}`, `main@{2}`.
 *
 * Returns `null` when the revision does not name a commit, so each command can report it with
 * Git's own wording for that command.
 */
export async function resolveRevision(ctx: GitContext, revision: string): Promise<string | null> {
  const parsed = parseRevision(revision.trim());
  if (!parsed) return null;
  let oid = await resolveBase(ctx, parsed.base);

  for (const { operator, count } of parsed.steps) {
    if (oid === null) return null;
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
