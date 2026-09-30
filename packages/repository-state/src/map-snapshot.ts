import {
  type GitCommitInfo,
  type GitRepositorySnapshot,
  type GitStatusEntry,
} from "@gitdojo/git-engine";
import { type CommitState, type FileState, type RepositoryState } from "@gitdojo/shared-types";

/** Working-tree status of a path, i.e. what the learner sees in "Working Tree". */
function workingTreeFile(entry: GitStatusEntry): FileState | null {
  switch (entry.unstaged) {
    case "untracked":
      return { path: entry.path, status: "untracked" };
    case "modified":
      return { path: entry.path, status: "modified" };
    case "deleted":
      return { path: entry.path, status: "deleted" };
    case null:
      // A path whose deletion is already staged no longer exists in the working tree.
      if (!entry.inWorkdir) return null;
      return { path: entry.path, status: entry.staged === null ? "committed" : "staged" };
  }
}

function stagedFile(entry: GitStatusEntry): FileState | null {
  return entry.staged === null
    ? null
    : { path: entry.path, status: "staged", change: entry.staged };
}

function commitState(commit: GitCommitInfo): CommitState {
  return {
    oid: commit.oid,
    shortOid: commit.shortOid,
    message: commit.message,
    authorName: commit.author.name,
    authorEmail: commit.author.email,
    timestamp: commit.author.timestamp,
    parents: commit.parents,
  };
}

/** Pure mapping from the Git engine's snapshot to GitDojo's normalized repository model. */
export function toRepositoryState(snapshot: GitRepositorySnapshot): RepositoryState {
  // A conflicted path is "conflicted" in the working tree until resolved, whatever the index says.
  const unresolved = new Set(
    (snapshot.merge?.conflicts ?? [])
      .filter((conflict) => !conflict.resolved)
      .map((conflict) => conflict.path),
  );
  const workingTree = (entry: GitStatusEntry): FileState | null =>
    unresolved.has(entry.path)
      ? { path: entry.path, status: "conflicted" }
      : workingTreeFile(entry);

  return {
    initialized: snapshot.initialized,
    currentBranch: snapshot.currentBranch,
    head: snapshot.head,
    branches: snapshot.branches.map((branch) => ({
      name: branch.name,
      oid: branch.oid,
      current: branch.name === snapshot.currentBranch,
    })),
    commits: snapshot.commits.map(commitState),
    allCommits: snapshot.allCommits.map(commitState),
    files: snapshot.entries.map(workingTree).filter((file) => file !== null),
    stagedFiles: snapshot.entries
      .filter((entry) => !unresolved.has(entry.path))
      .map(stagedFile)
      .filter((file) => file !== null),
    conflicts: (snapshot.merge?.conflicts ?? []).map((conflict) => ({
      path: conflict.path,
      ...(conflict.ours === null ? {} : { ours: conflict.ours }),
      ...(conflict.theirs === null ? {} : { theirs: conflict.theirs }),
      ...(conflict.base === null ? {} : { base: conflict.base }),
      resolved: conflict.resolved,
    })),
    merge: snapshot.merge && { branch: snapshot.merge.branch, oid: snapshot.merge.theirs },
  };
}
