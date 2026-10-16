import { type RepositoryState } from "@gitdojo/shared-types";
import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { findBranch } from "./branches";

function describeCommit(repository: RepositoryState, oid: string): string {
  const commit = repository.allCommits.find((candidate) => candidate.oid === oid);
  return commit ? `"${commit.message.split("\n")[0] ?? ""}"` : `a commit you have not fetched`;
}

function commitHasMessage(repository: RepositoryState, oid: string, message: string): boolean {
  return (
    repository.allCommits.find((candidate) => candidate.oid === oid)?.message.trim() ===
    message.trim()
  );
}

/** The simulated remote's branch points at the commit with `message`, or where `sameAs` does. */
export const remoteBranchPointsToCommit: ValidatorHandler<
  ValidatorOfType<"remote_branch_points_to_commit">
> = ({ branch, remote = "origin", message, sameAs }, { repository }) => {
  const server = repository.remotes.find((candidate) => candidate.name === remote);
  if (!server) {
    return Promise.resolve({ passed: false, reason: `There is no remote named ${remote}.` });
  }
  const tip = server.branches.find((candidate) => candidate.name === branch)?.oid;
  if (tip === undefined) {
    return Promise.resolve({ passed: false, reason: `${remote} has no branch ${branch} yet.` });
  }
  if (sameAs !== undefined) {
    const local = findBranch(repository, sameAs);
    if (!local) {
      return Promise.resolve({ passed: false, reason: `There is no branch named ${sameAs}.` });
    }
    return Promise.resolve(
      local.oid === tip
        ? { passed: true }
        : {
            passed: false,
            reason: `${branch} on ${remote} points to ${describeCommit(repository, tip)}, not where your ${sameAs} is.`,
          },
    );
  }
  if (message !== undefined && !commitHasMessage(repository, tip, message)) {
    return Promise.resolve({
      passed: false,
      reason: `${branch} on ${remote} points to ${describeCommit(repository, tip)}, not "${message.trim()}".`,
    });
  }
  return Promise.resolve({ passed: true });
};

/** `origin/main` exists and points at the commit with `message`, or where the remote's is now. */
export const remoteTrackingBranchPointsToCommit: ValidatorHandler<
  ValidatorOfType<"remote_tracking_branch_points_to_commit">
> = ({ ref, message, matchesRemote }, { repository }) => {
  const tracking = repository.remoteBranches.find((candidate) => candidate.name === ref.trim());
  if (!tracking) {
    return Promise.resolve({ passed: false, reason: `There is no remote-tracking branch ${ref}.` });
  }
  if (matchesRemote) {
    const server = repository.remotes
      .find((candidate) => candidate.name === tracking.remote)
      ?.branches.find((candidate) => candidate.name === tracking.branch);
    if (server?.oid !== tracking.oid) {
      return Promise.resolve({
        passed: false,
        reason: `${ref} is not where ${tracking.branch} on ${tracking.remote} is now.`,
      });
    }
  }
  if (message !== undefined && !commitHasMessage(repository, tracking.oid, message)) {
    return Promise.resolve({
      passed: false,
      reason: `${ref} points to ${describeCommit(repository, tracking.oid)}, not "${message.trim()}".`,
    });
  }
  return Promise.resolve({ passed: true });
};

export const branchUpstream: ValidatorHandler<ValidatorOfType<"branch_upstream">> = (
  { branch, upstream },
  { repository },
) => {
  const target = findBranch(repository, branch);
  if (!target) {
    return Promise.resolve({ passed: false, reason: `There is no branch named ${branch}.` });
  }
  if (target.upstream?.name === upstream.trim()) return Promise.resolve({ passed: true });
  return Promise.resolve({
    passed: false,
    reason: target.upstream
      ? `${branch} tracks ${target.upstream.name}, not ${upstream}.`
      : `${branch} has no upstream yet.`,
  });
};
