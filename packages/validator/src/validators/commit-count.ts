import { type ValidatorHandler, type ValidatorOfType } from "../types";

export const commitCount: ValidatorHandler<ValidatorOfType<"commit_count">> = (
  { count },
  { repository },
) => {
  const actual = repository.commits.length;
  return Promise.resolve(
    actual === count
      ? { passed: true }
      : {
          passed: false,
          reason: `Expected ${String(count)} commit${count === 1 ? "" : "s"}, found ${String(actual)}.`,
        },
  );
};
