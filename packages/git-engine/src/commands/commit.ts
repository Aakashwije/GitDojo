import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { DEFAULT_AUTHOR, type GitCommitInput, type GitCommitResult } from "../engine/git-engine";
import { clearMergeState, readMergeState, unresolvedConflicts } from "../engine/merge-state";
import { currentBranch, isRepository, resolveRefOrNull, shortOid } from "../engine/repository";
import { hasStagedChanges } from "../engine/status-matrix";
import { formatStatus, readStatusData } from "./status";

export const COMMIT_MESSAGE_REQUIRED = "error: commit message is required";

export async function runCommit(ctx: GitContext, input: GitCommitInput): Promise<GitCommitResult> {
  if (!(await isRepository(ctx))) {
    return input.message.trim() === ""
      ? failure(gitError("INVALID_ARGUMENT", COMMIT_MESSAGE_REQUIRED))
      : notARepository();
  }

  const merge = await readMergeState(ctx);
  if (merge && unresolvedConflicts(merge).length > 0) {
    return failure(
      gitError(
        "UNRESOLVED_CONFLICTS",
        [
          "error: Committing is not possible because you have unmerged files.",
          "hint: Fix them up in the work tree, and then use 'git add <file>'",
          "hint: as appropriate to mark resolution and make a commit.",
          "fatal: Exiting because of an unresolved conflict.",
        ].join("\n"),
      ),
    );
  }
  // Concluding a merge may use the prepared "Merge branch '...'" message, like `git commit --no-edit`.
  const message = input.message.trim() || (merge?.message ?? "");
  if (message === "") {
    return failure(gitError("INVALID_ARGUMENT", COMMIT_MESSAGE_REQUIRED));
  }

  const status = await readStatusData(ctx);
  // A merge commit may record no changes of its own (e.g. every conflict resolved to our version).
  if (!merge && !hasStagedChanges(status.entries)) {
    // Real Git prints the status report when there is nothing to commit.
    return failure(gitError("NOTHING_TO_COMMIT", "nothing to commit"), formatStatus(status));
  }

  const author = {
    ...(input.author ?? DEFAULT_AUTHOR),
    ...(input.timestamp === undefined ? {} : { timestamp: input.timestamp }),
  };
  const head = await resolveRefOrNull(ctx, "HEAD");
  const oid = await git.commit({
    fs: ctx.fs,
    dir: ctx.dir,
    message,
    author,
    ...(merge && head !== null ? { parent: [head, merge.theirs] } : {}),
  });
  if (merge) await clearMergeState(ctx);

  const branch = await currentBranch(ctx);
  const changes = status.entries.filter((entry) => entry.staged !== null);
  const rootCommit = !status.hasCommits;

  const fileWord = changes.length === 1 ? "file" : "files";
  const modeLines = changes.flatMap((entry) => {
    if (entry.staged === "added") return [` create mode 100644 ${entry.path}`];
    if (entry.staged === "deleted") return [` delete mode 100644 ${entry.path}`];
    return [];
  });
  const header = `[${branch ?? "detached HEAD"}${rootCommit ? " (root-commit)" : ""} ${shortOid(oid)}] ${message.split("\n")[0] ?? ""}`;
  // Like Git, concluding a merge prints only the summary line.
  const output = merge
    ? header
    : [header, ` ${String(changes.length)} ${fileWord} changed`, ...modeLines].join("\n");

  return success(output, {
    oid,
    shortOid: shortOid(oid),
    branch,
    rootCommit,
    filesChanged: changes.length,
  });
}
