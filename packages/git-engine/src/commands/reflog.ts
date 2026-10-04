import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitReflogResult } from "../engine/git-engine";
import { readReflog, ZERO_OID } from "../engine/reflog";
import { isRepository, resolveRefOrNull, shortOid } from "../engine/repository";
import { isValidBranchName } from "./branch";
import { branchDecorations } from "./log";

/**
 * `git reflog` / `git reflog show [<branch>]`: everywhere HEAD (or a branch) has pointed, newest
 * first, one line per move:
 *
 *   e2e871a (HEAD -> main) HEAD@{0}: commit: Add forecast script
 *
 * The way back to commits no branch remembers any more.
 */
export async function runReflog(ctx: GitContext, ref = "HEAD"): Promise<GitReflogResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const name = ref === "HEAD" ? "HEAD" : `refs/heads/${ref}`;
  if (ref !== "HEAD" && (!isValidBranchName(ref) || (await resolveRefOrNull(ctx, name)) === null)) {
    return failure(
      gitError(
        "INVALID_REVISION",
        `fatal: ambiguous argument '${ref}': unknown revision or path not in the working tree.`,
      ),
    );
  }
  const records = await readReflog(ctx, name);
  const decorations = await branchDecorations(ctx);
  const output = records
    .map((record, index) => {
      const labels = decorations.get(record.newOid);
      const decoration = labels ? ` (${labels.join(", ")})` : "";
      return `${shortOid(record.newOid)}${decoration} ${ref}@{${String(index)}}: ${record.message}`;
    })
    .join("\n");
  return success(output, {
    entries: records.map((record, index) => ({
      index,
      oid: record.newOid,
      previousOid: record.oldOid === ZERO_OID ? null : record.oldOid,
      message: record.message,
      timestamp: record.timestamp,
    })),
  });
}
