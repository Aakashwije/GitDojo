import { type ChallengeCategory } from "@gitdojo/shared-types";

export interface ChallengeCategoryInfo {
  id: ChallengeCategory;
  title: string;
  description: string;
}

/** Categories in the order the challenge browser shows them. */
export const CHALLENGE_CATEGORIES: readonly ChallengeCategoryInfo[] = [
  { id: "basics", title: "Basics", description: "Repositories, staging and commits." },
  { id: "branching", title: "Branching", description: "Branches, HEAD and moving between them." },
  { id: "merging", title: "Merging", description: "Bringing lines of work back together." },
  { id: "conflicts", title: "Conflicts", description: "When two changes collide." },
  { id: "recovery", title: "Recovery", description: "Undoing mistakes and finding lost work." },
  { id: "history", title: "History", description: "Copying and reshaping commits." },
  { id: "advanced", title: "Advanced", description: "Several problems at once." },
];

export function categoryInfo(id: ChallengeCategory): ChallengeCategoryInfo {
  const info = CHALLENGE_CATEGORIES.find((category) => category.id === id);
  if (!info) throw new Error(`Unknown challenge category "${id}"`);
  return info;
}
