import { type ValidatorHandler, type ValidatorOfType } from "../types";

/** A tag exists; optionally on the commit with `message`, and annotated (or lightweight). */
export const tagExists: ValidatorHandler<ValidatorOfType<"tag_exists">> = (
  { tag, message, annotated },
  { repository },
) => {
  const found = repository.tags.find((candidate) => candidate.name === tag.trim());
  if (!found) return Promise.resolve({ passed: false, reason: `There is no tag named ${tag}.` });
  if (annotated !== undefined && found.annotated !== annotated) {
    return Promise.resolve({
      passed: false,
      reason: `${tag} is ${found.annotated ? "an annotated" : "a lightweight"} tag.`,
    });
  }
  if (message !== undefined) {
    const commit = repository.allCommits.find((candidate) => candidate.oid === found.oid);
    const subject = commit?.message.trim() ?? found.oid.slice(0, 7);
    if (subject !== message.trim()) {
      return Promise.resolve({
        passed: false,
        reason: `${tag} names "${subject.split("\n")[0] ?? ""}", not "${message.trim()}".`,
      });
    }
  }
  return Promise.resolve({ passed: true });
};

export const tagNotExists: ValidatorHandler<ValidatorOfType<"tag_not_exists">> = (
  { tag },
  { repository },
) =>
  Promise.resolve(
    repository.tags.some((candidate) => candidate.name === tag.trim())
      ? { passed: false, reason: `The tag ${tag} still exists.` }
      : { passed: true },
  );
