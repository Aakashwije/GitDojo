import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { findBranch, historyOf } from "./branches";
import { normalizeLessonPath } from "./paths";

/** Passes when the current working-tree file has exactly the authored text. */
export const fileContent: ValidatorHandler<ValidatorOfType<"file_content">> = (
  { file, content },
  { repository },
) => {
  const path = normalizeLessonPath(file);
  const actual = repository.files.find((candidate) => candidate.path === path)?.content;
  return Promise.resolve(
    actual === content
      ? { passed: true }
      : {
          passed: false,
          reason:
            actual === undefined
              ? `${path} is not in the working tree.`
              : `${path} does not have the expected contents.`,
        },
  );
};

/** Passes when a named commit on a branch changes exactly the listed paths. */
export const commitChanges: ValidatorHandler<ValidatorOfType<"commit_changes">> = (
  { branch, message, files },
  { repository },
) => {
  const target = findBranch(repository, branch);
  if (!target)
    return Promise.resolve({ passed: false, reason: `There is no branch named ${branch}.` });

  const expectedMessage = message.trim();
  const expectedFiles = files.map(normalizeLessonPath).sort();
  const commit = historyOf(repository, target.oid).find(
    (candidate) => candidate.message.trim() === expectedMessage,
  );
  if (!commit)
    return Promise.resolve({
      passed: false,
      reason: `${branch} does not contain a commit "${expectedMessage}".`,
    });

  const actualFiles = [...commit.changedPaths].sort();
  return Promise.resolve(
    actualFiles.length === expectedFiles.length &&
      actualFiles.every((path, index) => path === expectedFiles[index])
      ? { passed: true }
      : {
          passed: false,
          reason: `"${expectedMessage}" changes ${actualFiles.join(", ") || "no files"}; expected ${expectedFiles.join(", ")}.`,
        },
  );
};
