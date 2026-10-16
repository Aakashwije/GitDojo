import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { findBranch } from "./branches";

function subject(message: string): string {
  return message.split("\n")[0]?.trim() ?? "";
}

/**
 * `branch`'s newest commits, following first parents (what `git log --first-parent --oneline`
 * shows), have exactly these subjects. Rewritten history such as an interactive rebase's result
 * is checked this way, whatever commands produced it.
 */
export const branchHistory: ValidatorHandler<ValidatorOfType<"branch_history">> = (
  { branch, messages, complete = false },
  { repository },
) => {
  const target = findBranch(repository, branch);
  if (!target) {
    return Promise.resolve({ passed: false, reason: `There is no branch named ${branch}.` });
  }
  const byOid = new Map(repository.allCommits.map((commit) => [commit.oid, commit]));
  const actual: string[] = [];
  for (let oid: string | undefined = target.oid; oid !== undefined;) {
    const commit = byOid.get(oid);
    if (!commit) break;
    actual.push(subject(commit.message));
    if (!complete && actual.length === messages.length) break;
    oid = commit.parents[0];
  }
  const expected = messages.map((message) => message.trim());
  const matches =
    actual.length === expected.length &&
    actual.every((message, index) => message === expected[index]);
  if (matches) return Promise.resolve({ passed: true });
  const shown = (complete ? actual : actual.slice(0, expected.length)).map((m) => `"${m}"`);
  return Promise.resolve({
    passed: false,
    reason: `${branch}'s history is ${shown.join(", ") || "empty"} (newest first).`,
  });
};
