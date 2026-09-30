import { type BranchState, type RepositoryState } from "@gitdojo/shared-types";

/** A branch that exists, i.e. points at a commit. An unborn branch does not exist yet in Git. */
export function findBranch(
  repository: RepositoryState,
  name: string,
): (BranchState & { oid: string }) | undefined {
  const branch = repository.branches.find((candidate) => candidate.name === name.trim());
  return branch?.oid ? { ...branch, oid: branch.oid } : undefined;
}

/** Oids of `tip` and all of its ancestors. */
export function reachableFrom(repository: RepositoryState, tip: string): Set<string> {
  const parents = new Map(repository.allCommits.map((commit) => [commit.oid, commit.parents]));
  const reached = new Set<string>();
  const pending = [tip];
  for (let oid = pending.pop(); oid !== undefined; oid = pending.pop()) {
    if (reached.has(oid)) continue;
    reached.add(oid);
    pending.push(...(parents.get(oid) ?? []));
  }
  return reached;
}

export function notInitialized() {
  return Promise.resolve({ passed: false, reason: "This directory is not a Git repository yet." });
}

/** Tip of `branch` when given, otherwise HEAD's commit; `null` when there is none. */
export function tipOf(repository: RepositoryState, branch: string | undefined): string | null {
  return branch === undefined ? repository.head : (findBranch(repository, branch)?.oid ?? null);
}

/** Commits reachable from `tip`, newest first. */
export function historyOf(repository: RepositoryState, tip: string | null) {
  if (tip === null) return [];
  const reachable = reachableFrom(repository, tip);
  return repository.allCommits.filter((commit) => reachable.has(commit.oid));
}
