import { type GitContext } from "../engine/context";
import { diffFile, formatFileDiff, type FileChange } from "../engine/diff";
import { failure, notARepository, success } from "../engine/errors";
import { type GitDiffOptions, type GitDiffResult, type GitFileDiff } from "../engine/git-engine";
import { matchesAny, parsePathspecs } from "../engine/pathspec";
import { isRepository, resolveRefOrNull } from "../engine/repository";
import { readStatusEntries } from "../engine/status-matrix";
import {
  hashText,
  readBlobText,
  readIndexFiles,
  readTreeFiles,
  readWorkingText,
} from "../engine/working-tree";

/**
 * `git diff` (staging area → working tree) and `git diff --staged` (HEAD → staging area), as
 * unified diffs. Untracked files are not part of either, as in Git.
 */
export async function runDiff(
  ctx: GitContext,
  options: GitDiffOptions = {},
): Promise<GitDiffResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const parsed = parsePathspecs(options.paths ?? []);
  if (!parsed.ok) return failure(parsed.error);
  const { pathspecs } = parsed;
  const selected = (path: string) => pathspecs.length === 0 || matchesAny(path, pathspecs);

  const [entries, index] = await Promise.all([readStatusEntries(ctx), readIndexFiles(ctx)]);
  const head = options.staged
    ? await readTreeFiles(ctx, await resolveRefOrNull(ctx, "HEAD"))
    : new Map<string, string>();
  const text = async (oid: string | undefined) =>
    oid === undefined ? null : readBlobText(ctx, oid);

  const changes: FileChange[] = [];
  for (const entry of entries) {
    if (!selected(entry.path)) continue;
    if (options.staged) {
      if (entry.staged === null) continue;
      changes.push({
        path: entry.path,
        before: await text(head.get(entry.path)),
        after: await text(index.get(entry.path)),
      });
    } else {
      if (entry.unstaged !== "modified" && entry.unstaged !== "deleted") continue;
      changes.push({
        path: entry.path,
        before: await text(index.get(entry.path)),
        after: await readWorkingText(ctx, entry.path),
      });
    }
  }

  const files: GitFileDiff[] = [];
  const blocks: string[] = [];
  for (const change of changes) {
    const diff = diffFile(change);
    if (diff.hunks.length === 0) continue;
    files.push(diff);
    blocks.push(
      formatFileDiff(diff, {
        before: change.before === null ? "" : await hashText(change.before),
        after: change.after === null ? "" : await hashText(change.after),
      }),
    );
  }
  // Like Git, no differences means no output at all.
  return success(blocks.join("\n"), { files });
}
