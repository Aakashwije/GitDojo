import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { normalizeLessonPath } from "./paths";

/** Passes however the file got staged (`git add README.md`, `git add .`, ...). */
export const fileStaged: ValidatorHandler<ValidatorOfType<"file_staged">> = (
  { file },
  { repository },
) => {
  const path = normalizeLessonPath(file);
  const staged = repository.stagedFiles.some((entry) => entry.path === path);
  return Promise.resolve(
    staged ? { passed: true } : { passed: false, reason: `${path} is not staged.` },
  );
};
