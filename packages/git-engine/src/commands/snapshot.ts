import { WorkspaceFileSystem } from "../filesystem/workspace-file-system";
import { type GitContext } from "../engine/context";
import { type GitBranchInfo, type GitRepositorySnapshot } from "../engine/git-engine";
import {
  createCommitCache,
  currentBranch,
  isRepository,
  readCommitsFrom,
  readCommitsFromHead,
  resolveRefOrNull,
} from "../engine/repository";
import { readBranches } from "./branch";
import { readEditorRecord, toPendingEditor } from "../engine/editor-state";
import { readRemoteTrackingBranches, readTags } from "../engine/refs";
import { readRemotes } from "../engine/remote-store";
import { operationKind, readMergeState } from "../engine/merge-state";
import { readStashes, toStashEntry } from "../engine/stash-store";
import { readReflog, ZERO_OID } from "../engine/reflog";
import { readStatusEntries } from "../engine/status-matrix";
import { readWorkingText } from "../engine/working-tree";

export async function readSnapshot(ctx: GitContext): Promise<GitRepositorySnapshot> {
  if (!(await isRepository(ctx))) {
    // Without a repository every file is simply "not tracked"; report them as untracked so the
    // UI can still show what is in the working directory.
    const files = await new WorkspaceFileSystem(ctx.fs).listFiles(ctx.workspaceId);
    return {
      initialized: false,
      currentBranch: null,
      head: null,
      branches: [],
      commits: [],
      allCommits: [],
      merge: null,
      reflog: [],
      stashes: [],
      tags: [],
      remotes: [],
      remoteBranches: [],
      editor: null,
      entries: await Promise.all(
        files
          .filter((file) => file.type === "file")
          .map(async (file) => ({
            path: file.path,
            inHead: false,
            inIndex: false,
            inWorkdir: true,
            staged: null,
            unstaged: "untracked" as const,
            content: await new WorkspaceFileSystem(ctx.fs).readFile(ctx.workspaceId, file.path),
          })),
      ),
    };
  }

  const [branch, head, entries, branchStates, merge, reflog, stashes] = await Promise.all([
    currentBranch(ctx),
    resolveRefOrNull(ctx, "HEAD"),
    readStatusEntries(ctx),
    // Includes an unborn current branch: it has no ref yet, but learners still expect to see it.
    readBranches(ctx),
    readMergeState(ctx),
    readReflog(ctx, "HEAD"),
    readStashes(ctx),
  ]);
  const [tags, remotes, remoteBranches, editor] = await Promise.all([
    readTags(ctx),
    readRemotes(ctx),
    readRemoteTrackingBranches(ctx),
    readEditorRecord(ctx),
  ]);
  const branches: GitBranchInfo[] = branchStates.map(({ name, oid, upstream }) => ({
    name,
    oid,
    ...(upstream ? { upstream } : {}),
  }));
  // Like `git log --all`: tags and remote-tracking branches keep their commits in the graph too.
  const tips = [
    head,
    ...branches.map((info) => info.oid),
    ...tags.map((tag) => tag.oid),
    ...remoteBranches.map((ref) => ref.oid),
  ].filter((oid) => oid !== null);
  // HEAD's history and every branch's share most commits: read each one once.
  const cache = createCommitCache();

  return {
    initialized: true,
    currentBranch: branch,
    head,
    branches,
    commits: head === null ? [] : await readCommitsFromHead(ctx, cache),
    allCommits: await readCommitsFrom(ctx, tips, cache),
    entries: await Promise.all(
      entries.map(async (entry) => ({
        ...entry,
        ...(entry.inWorkdir ? { content: (await readWorkingText(ctx, entry.path)) ?? "" } : {}),
      })),
    ),
    reflog: reflog.map((entry, index) => ({
      index,
      oid: entry.newOid,
      previousOid: entry.oldOid === ZERO_OID ? null : entry.oldOid,
      message: entry.message,
      timestamp: entry.timestamp,
    })),
    stashes: stashes.map(toStashEntry),
    tags,
    remotes,
    remoteBranches,
    editor: editor && toPendingEditor(editor),
    merge: merge && {
      kind: operationKind(merge),
      ...(merge.rebase
        ? {
            rebase: {
              branch: merge.rebase.branch,
              onto: merge.rebase.onto,
              remaining: merge.rebase.todo.length,
            },
          }
        : {}),
      branch: merge.branch,
      theirs: merge.theirs,
      conflicts: merge.conflicts.map(({ path, base, ours, theirs, resolved }) => ({
        path,
        base,
        ours,
        theirs,
        resolved,
      })),
    },
  };
}
