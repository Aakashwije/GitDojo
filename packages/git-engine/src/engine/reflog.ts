import { hasErrorCode } from "../filesystem/fs-errors";
import { ensureDirectory } from "../filesystem/fs-helpers";
import { type GitContext } from "./context";
import { DEFAULT_AUTHOR } from "./git-engine";

export const ZERO_OID = "0".repeat(40);

/** One line of a reflog: the ref moved from `oldOid` to `newOid` because of `message`. */
export interface ReflogRecord {
  oldOid: string;
  newOid: string;
  /** Seconds since the Unix epoch. */
  timestamp: number;
  /** e.g. `commit: Add login form`, `checkout: moving from main to feature`. */
  message: string;
}

/**
 * isomorphic-git does not keep reflogs, so GitDojo writes them itself in Git's own format
 * (`.git/logs/HEAD`, `.git/logs/refs/heads/<branch>`), one line per ref update:
 *
 *   <old oid> <new oid> <name> <<email>> <timestamp> <timezone>\t<message>
 */
function logPath(ctx: GitContext, ref: string): string {
  return `${ctx.dir}/.git/logs/${ref}`;
}

function timezone(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absolute = Math.abs(offset);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}${String(absolute % 60).padStart(2, "0")}`;
}

async function append(ctx: GitContext, ref: string, record: ReflogRecord): Promise<void> {
  const path = logPath(ctx, ref);
  await ensureDirectory(ctx.fs.promises, path.slice(0, path.lastIndexOf("/")));
  let existing = "";
  try {
    const raw = await ctx.fs.promises.readFile(path, { encoding: "utf8" });
    existing = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT")) throw error;
  }
  const { name, email } = DEFAULT_AUTHOR;
  const line = `${record.oldOid} ${record.newOid} ${name} <${email}> ${String(record.timestamp)} ${timezone(new Date(record.timestamp * 1000))}\t${record.message.split("\n")[0] ?? ""}\n`;
  await ctx.fs.promises.writeFile(path, existing + line, "utf8");
}

/** Newest first, like `git reflog`. Empty when the ref has no log. */
export async function readReflog(ctx: GitContext, ref = "HEAD"): Promise<ReflogRecord[]> {
  let raw: string | Uint8Array;
  try {
    raw = await ctx.fs.promises.readFile(logPath(ctx, ref), { encoding: "utf8" });
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return [];
    throw error;
  }
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line): ReflogRecord => {
      const [head = "", message = ""] = line.split("\t");
      const fields = head.split(" ");
      return {
        oldOid: fields[0] ?? ZERO_OID,
        newOid: fields[1] ?? ZERO_OID,
        timestamp: Number(fields.at(-2) ?? 0),
        message,
      };
    })
    .reverse();
}

export interface RefMove {
  /** Where HEAD was (null on an unborn branch). */
  from: string | null;
  /** Where HEAD is now. */
  to: string;
  message: string;
  /** The branch that moved with HEAD, if any; it gets the same entry in its own log. */
  branch?: string | null;
}

/** Records a HEAD movement (and the branch that moved with it) in the reflog. */
export async function logHeadMove(ctx: GitContext, move: RefMove): Promise<void> {
  const record: ReflogRecord = {
    oldOid: move.from ?? ZERO_OID,
    newOid: move.to,
    timestamp: Math.floor(Date.now() / 1000),
    message: move.message,
  };
  await append(ctx, "HEAD", record);
  if (move.branch) await append(ctx, `refs/heads/${move.branch}`, record);
}

/** Records a branch moving without HEAD, e.g. `git branch feature` or `git branch -f`. */
export async function logBranchMove(
  ctx: GitContext,
  branch: string,
  move: Omit<RefMove, "branch">,
): Promise<void> {
  await append(ctx, `refs/heads/${branch}`, {
    oldOid: move.from ?? ZERO_OID,
    newOid: move.to,
    timestamp: Math.floor(Date.now() / 1000),
    message: move.message,
  });
}

/** Deletes a branch's log, as `git branch -d` does. */
export async function deleteReflog(ctx: GitContext, branch: string): Promise<void> {
  try {
    await ctx.fs.promises.unlink(logPath(ctx, `refs/heads/${branch}`));
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT")) throw error;
  }
}

/** `HEAD@{n}` / `main@{n}`: where the ref was n moves ago. */
export async function reflogEntry(
  ctx: GitContext,
  ref: string,
  index: number,
): Promise<string | null> {
  const name = ref === "HEAD" || ref.startsWith("refs/") ? ref : `refs/heads/${ref}`;
  const entry = (await readReflog(ctx, name))[index];
  return entry && entry.newOid !== ZERO_OID ? entry.newOid : null;
}

/**
 * The branch HEAD was on before the last `checkout: moving from X to Y`, for `git switch -`.
 * Returns the branch name or a commit id (when that position was detached).
 */
export async function previousCheckout(ctx: GitContext): Promise<string | null> {
  for (const entry of await readReflog(ctx, "HEAD")) {
    const match = /^checkout: moving from (\S+) to \S+$/.exec(entry.message);
    if (match) return match[1] ?? null;
  }
  return null;
}
