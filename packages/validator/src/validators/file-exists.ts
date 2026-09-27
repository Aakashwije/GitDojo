import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { normalizeLessonPath } from "./paths";

export const fileExists: ValidatorHandler<ValidatorOfType<"file_exists">> = (
  { file },
  { repository },
) => {
  const path = normalizeLessonPath(file);
  const exists = repository.files.some(
    (entry) => entry.path === path && entry.status !== "deleted",
  );
  return Promise.resolve(
    exists ? { passed: true } : { passed: false, reason: `${path} does not exist.` },
  );
};
