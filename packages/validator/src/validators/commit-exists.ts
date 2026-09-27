import { type ValidatorHandler, type ValidatorOfType } from "../types";

export const commitExists: ValidatorHandler<ValidatorOfType<"commit_exists">> = (
  { message },
  { repository },
) => {
  if (repository.commits.length === 0) {
    return Promise.resolve({ passed: false, reason: "There are no commits yet." });
  }
  if (message === undefined) return Promise.resolve({ passed: true });

  const expected = message.trim();
  const found = repository.commits.some((commit) => commit.message.trim() === expected);
  return Promise.resolve(
    found
      ? { passed: true }
      : { passed: false, reason: `No commit has the message "${expected}".` },
  );
};
