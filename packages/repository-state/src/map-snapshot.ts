import {
  type GitCommitInfo,
  type GitRepositorySnapshot,
  type GitStatusEntry,
} from "@gitdojo/git-engine";
import { type CommitState, type FileState, type RepositoryState } from "@gitdojo/shared-types";

/** Working-tree status of a path, i.e. what the learner sees in "Working Tree". */
function workingTreeFile(entry: GitStatusEntry): FileState | null {
  const content = entry.content === undefined ? {} : { content: entry.content };
  switch (entry.unstaged) {
    case "untracked":
      return { path: entry.path, status: "untracked", ...content };
    case "modified":
      return { path: entry.path, status: "modified", ...content };
    case "deleted":
      return { path: entry.path, status: "deleted" };
    case null:
      // A path whose deletion is already staged no longer exists in the working tree.
      if (!entry.inWorkdir) return null;
      return {
        path: entry.path,
        status: entry.staged === null ? "committed" : "staged",
        ...content,
      };
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
    changedPaths: commit.changedPaths,
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
      ? {
          path: entry.path,
          status: "conflicted",
          // The text with or without markers, e.g. to tell an edited conflict from an open one.
          ...(entry.content === undefined ? {} : { content: entry.content }),
        }
      : workingTreeFile(entry);

  return {
    initialized: snapshot.initialized,
    currentBranch: snapshot.currentBranch,
    head: snapshot.head,
    branches: snapshot.branches.map((branch) => ({
      name: branch.name,
      oid: branch.oid,
      current: branch.name === snapshot.currentBranch,
      ...(branch.upstream ? { upstream: { ...branch.upstream } } : {}),
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
    merge: snapshot.merge && {
      kind: snapshot.merge.kind,
      branch: snapshot.merge.branch,
      oid: snapshot.merge.theirs,
      ...(snapshot.merge.rebase ? { rebase: snapshot.merge.rebase } : {}),
    },
    stashes: snapshot.stashes.map((stash) => ({
      selector: `stash@{${String(stash.index)}}`,
      message: stash.message,
      branch: stash.branch,
      oid: stash.oid,
      files: stash.paths,
    })),
    reflog: snapshot.reflog.map((entry) => ({
      selector: `HEAD@{${String(entry.index)}}`,
      oid: entry.oid,
      shortOid: entry.oid.slice(0, 7),
      message: entry.message,
      timestamp: entry.timestamp,
    })),
    tags: snapshot.tags.map((tag) => ({
      name: tag.name,
      oid: tag.oid,
      annotated: tag.annotated,
      ...(tag.message === undefined ? {} : { message: tag.message }),
    })),
    remotes: snapshot.remotes.map((remote) => ({
      name: remote.name,
      url: remote.url,
      branches: remote.branches.map((branch) => ({ name: branch.name, oid: branch.oid })),
    })),
    remoteBranches: snapshot.remoteBranches.map((ref) => ({ ...ref })),
    editor: snapshot.editor && { ...snapshot.editor },
  };
}
