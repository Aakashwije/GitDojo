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
import { readMergeState } from "../engine/merge-state";
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

  const [branch, head, entries, branchStates, merge] = await Promise.all([
    currentBranch(ctx),
    resolveRefOrNull(ctx, "HEAD"),
    readStatusEntries(ctx),
    // Includes an unborn current branch: it has no ref yet, but learners still expect to see it.
    readBranches(ctx),
    readMergeState(ctx),
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
    merge: merge && {
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
