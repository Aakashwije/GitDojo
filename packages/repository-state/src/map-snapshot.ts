import { type GitRepositorySnapshot, type GitStatusEntry } from "@gitdojo/git-engine";
import { type FileState, type RepositoryState } from "@gitdojo/shared-types";

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

/** Pure mapping from the Git engine's snapshot to GitDojo's normalized repository model. */
export function toRepositoryState(snapshot: GitRepositorySnapshot): RepositoryState {
  return {
    initialized: snapshot.initialized,
    currentBranch: snapshot.currentBranch,
    head: snapshot.head,
    branches: snapshot.branches.map((branch) => ({
      name: branch.name,
      oid: branch.oid,
      current: branch.name === snapshot.currentBranch,
    })),
    commits: snapshot.commits.map((commit) => ({
      oid: commit.oid,
      shortOid: commit.shortOid,
      message: commit.message,
      authorName: commit.author.name,
      authorEmail: commit.author.email,
      timestamp: commit.author.timestamp,
      parents: commit.parents,
    })),
    files: snapshot.entries.map(workingTreeFile).filter((file) => file !== null),
    stagedFiles: snapshot.entries.map(stagedFile).filter((file) => file !== null),
    // Merge conflicts arrive with merge support in a later phase.
    conflicts: [],
  };
}
