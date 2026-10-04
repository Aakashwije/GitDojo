import { WorkspaceFileSystem } from "../filesystem/workspace-file-system";
import { type GitContext } from "../engine/context";
import { type GitBranchInfo, type GitRepositorySnapshot } from "../engine/git-engine";
import {
  currentBranch,
  isRepository,
  readCommitsFrom,
  readCommitsFromHead,
  resolveRefOrNull,
} from "../engine/repository";
import { readBranches } from "./branch";
import { operationKind, readMergeState } from "../engine/merge-state";
import { readStashes, toStashEntry } from "../engine/stash-store";
import { readReflog, ZERO_OID } from "../engine/reflog";
import { readStatusEntries } from "../engine/status-matrix";

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
      entries: files
        .filter((file) => file.type === "file")
        .map((file) => ({
          path: file.path,
          inHead: false,
          inIndex: false,
          inWorkdir: true,
          staged: null,
          unstaged: "untracked",
        })),
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
  const branches: GitBranchInfo[] = branchStates.map(({ name, oid }) => ({ name, oid }));
  const tips = [head, ...branches.map((info) => info.oid)].filter((oid) => oid !== null);

  return {
    initialized: true,
    currentBranch: branch,
    head,
    branches,
    commits: head === null ? [] : await readCommitsFromHead(ctx),
    allCommits: await readCommitsFrom(ctx, tips),
    entries,
    reflog: reflog.map((entry, index) => ({
      index,
      oid: entry.newOid,
      previousOid: entry.oldOid === ZERO_OID ? null : entry.oldOid,
      message: entry.message,
      timestamp: entry.timestamp,
    })),
    stashes: stashes.map(toStashEntry),
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
