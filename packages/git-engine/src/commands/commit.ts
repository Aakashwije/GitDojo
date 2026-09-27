import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { DEFAULT_AUTHOR, type GitCommitInput, type GitCommitResult } from "../engine/git-engine";
import { currentBranch, isRepository, shortOid } from "../engine/repository";
import { hasStagedChanges } from "../engine/status-matrix";
import { formatStatus, readStatusData } from "./status";

export const COMMIT_MESSAGE_REQUIRED = "error: commit message is required";

export async function runCommit(ctx: GitContext, input: GitCommitInput): Promise<GitCommitResult> {
  const message = input.message.trim();
  if (message === "") {
    return failure(gitError("INVALID_ARGUMENT", COMMIT_MESSAGE_REQUIRED));
  }
  if (!(await isRepository(ctx))) return notARepository();

  const status = await readStatusData(ctx);
  if (!hasStagedChanges(status.entries)) {
    // Real Git prints the status report when there is nothing to commit.
    return failure(gitError("NOTHING_TO_COMMIT", "nothing to commit"), formatStatus(status));
  }

  const author = input.author ?? DEFAULT_AUTHOR;
  const oid = await git.commit({ fs: ctx.fs, dir: ctx.dir, message, author });
  const branch = await currentBranch(ctx);
  const changes = status.entries.filter((entry) => entry.staged !== null);
  const rootCommit = !status.hasCommits;

  const fileWord = changes.length === 1 ? "file" : "files";
  const modeLines = changes.flatMap((entry) => {
    if (entry.staged === "added") return [` create mode 100644 ${entry.path}`];
    if (entry.staged === "deleted") return [` delete mode 100644 ${entry.path}`];
    return [];
  });
  const output = [
    `[${branch ?? "detached HEAD"}${rootCommit ? " (root-commit)" : ""} ${shortOid(oid)}] ${message.split("\n")[0] ?? ""}`,
    ` ${String(changes.length)} ${fileWord} changed`,
    ...modeLines,
  ].join("\n");

  return success(output, {
    oid,
    shortOid: shortOid(oid),
    branch,
    rootCommit,
    filesChanged: changes.length,
  });
}
