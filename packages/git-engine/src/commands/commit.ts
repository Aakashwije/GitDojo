import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { DEFAULT_AUTHOR, type GitCommitInput, type GitCommitResult } from "../engine/git-engine";
import {
  clearMergeState,
  operationKind,
  readMergeState,
  unresolvedConflicts,
  writeMergeState,
} from "../engine/merge-state";
import { logHeadMove } from "../engine/reflog";
import {
  currentBranch,
  isRepository,
  resolveRefOrNull,
  shortOid,
  subject,
} from "../engine/repository";
import { hasStagedChanges } from "../engine/status-matrix";
import { formatStatus, readStatusData } from "./status";

export const COMMIT_MESSAGE_REQUIRED = "error: commit message is required";

export const UNRESOLVED_CONFLICTS_MESSAGE = [
  "error: Committing is not possible because you have unmerged files.",
  "hint: Fix them up in the work tree, and then use 'git add <file>'",
  "hint: as appropriate to mark resolution and make a commit.",
  "fatal: Exiting because of an unresolved conflict.",
].join("\n");

export async function runCommit(ctx: GitContext, input: GitCommitInput): Promise<GitCommitResult> {
  if (!(await isRepository(ctx))) {
    return input.message.trim() === ""
      ? failure(gitError("INVALID_ARGUMENT", COMMIT_MESSAGE_REQUIRED))
      : notARepository();
  }

  const merge = await readMergeState(ctx);
  if (merge && unresolvedConflicts(merge).length > 0) {
    return failure(gitError("UNRESOLVED_CONFLICTS", UNRESOLVED_CONFLICTS_MESSAGE));
  }
  const operation = merge ? operationKind(merge) : null;
  // A rebase step that was already committed has nothing left for `git commit` to conclude.
  const concluding = merge !== null && !(operation === "rebase" && merge.rebase?.current === null);
  // Concluding an operation may use its prepared message, like `git commit --no-edit`.
  const message = input.message.trim() || (concluding ? merge.message : "");
  if (message === "") {
    return failure(gitError("INVALID_ARGUMENT", COMMIT_MESSAGE_REQUIRED));
  }

  const status = await readStatusData(ctx);
  // A merge commit may record no changes of its own (e.g. every conflict resolved to our version).
  if (operation !== "merge" && !hasStagedChanges(status.entries)) {
    if (concluding && (operation === "cherry-pick" || operation === "revert")) {
      // Every change was resolved away: there is nothing left to pick or revert.
      await clearMergeState(ctx);
      return failure(
        gitError(
          "EMPTY_COMMIT",
          `The previous ${operation} is now empty, possibly due to conflict resolution.`,
        ),
        `${formatStatus({ ...status, merge: null })}\nThe previous ${operation} is now empty, possibly due to conflict resolution.`,
      );
    }
    // Real Git prints the status report when there is nothing to commit.
    return failure(gitError("NOTHING_TO_COMMIT", "nothing to commit"), formatStatus(status));
  }

  // Cherry-picks and rebased commits keep their original author; the learner commits them.
  const original = concluding && input.message.trim() === "" ? merge.author : undefined;
  const author = original ?? {
    ...(input.author ?? DEFAULT_AUTHOR),
    ...(input.timestamp === undefined ? {} : { timestamp: input.timestamp }),
  };
  const head = await resolveRefOrNull(ctx, "HEAD");
  const oid = await git.commit({
    fs: ctx.fs,
    dir: ctx.dir,
    message,
    author,
    ...(original ? { committer: DEFAULT_AUTHOR } : {}),
    ...(operation === "merge" && head !== null ? { parent: [head, merge?.theirs ?? head] } : {}),
  });
  if (operation === "rebase" && merge?.rebase) {
    // The stopped step is done; `git rebase --continue` replays the rest.
    await writeMergeState(ctx, {
      ...merge,
      conflicts: [],
      touched: [],
      rebase: { ...merge.rebase, current: null },
    });
  } else if (merge) {
    await clearMergeState(ctx);
  }

  const branch = await currentBranch(ctx);
  const changes = status.entries.filter((entry) => entry.staged !== null);
  const rootCommit = !status.hasCommits;
  const kind = rootCommit
    ? " (initial)"
    : operation === "merge"
      ? " (merge)"
      : operation === "cherry-pick" && concluding
        ? " (cherry-pick)"
        : "";
  await logHeadMove(ctx, {
    from: head,
    to: oid,
    message: `commit${kind}: ${subject(message)}`,
    branch,
  });

  const fileWord = changes.length === 1 ? "file" : "files";
  const modeLines = changes.flatMap((entry) => {
    if (entry.staged === "added") return [` create mode 100644 ${entry.path}`];
    if (entry.staged === "deleted") return [` delete mode 100644 ${entry.path}`];
    return [];
  });
  const header = `[${branch ?? "detached HEAD"}${rootCommit ? " (root-commit)" : ""} ${shortOid(oid)}] ${message.split("\n")[0] ?? ""}`;
  // Like Git, concluding a merge prints only the summary line.
  const output =
    operation === "merge"
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
