/** Versioned, fixed criteria. Changing requirements means a new version, never an edit here. */
export const AWARDS = {
  "git-foundations": {
    title: "Git Foundations",
    description: "GitDojo completion certificate for foundational Git lessons and practice.",
    template: "git-foundations-template.png",
    criteriaVersion: 1,
    lessons: [
      "what-is-git", "git-vs-github", "git-init", "git-status", "working-tree",
      "staging-area", "git-add", "git-commit", "git-log", "first-repository-challenge",
    ],
    practice: ["commit-one-change"],
  },
  "branching-collaboration": {
    title: "Branching & Collaboration",
    description: "GitDojo completion certificate for branching and merging lessons and practice.",
    template: "branching-collaboration-template.png",
    criteriaVersion: 1,
    lessons: [
      "what-is-a-branch", "understanding-head", "git-branch", "git-switch",
      "commit-on-branch", "branching-challenge", "what-is-merging", "fast-forward-merge",
      "three-way-merge", "merge-feature-into-main", "merge-challenge",
    ],
    practice: ["start-a-branch", "merge-a-feature"],
  },
  "git-recovery-history": {
    title: "Git Recovery & History",
    description: "GitDojo completion certificate for history and recovery lessons and practice.",
    template: "git-recovery-history-template.png",
    criteriaVersion: 1,
    lessons: [
      "git-diff", "git-restore", "three-trees", "git-reset", "git-revert", "git-stash",
      "git-cherry-pick", "git-reflog", "git-rebase", "git-rebase-interactive",
      "recovery-challenge",
    ],
    practice: ["rescue-a-reset", "shelve-and-switch"],
  },
} as const;

export type AwardKey = keyof typeof AWARDS;
export const awardKeys = Object.keys(AWARDS) as AwardKey[];
export function isAwardKey(value: unknown): value is AwardKey {
  return typeof value === "string" && Object.hasOwn(AWARDS, value);
}

export function criteriaNarrative(key: AwardKey): string {
  const award = AWARDS[key];
  return `Complete ${award.lessons.length} named lessons and ${award.practice.length} named Practice mode tasks in GitDojo. Completions are learner-reported and content IDs are checked by GitDojo; exercise outcomes are not independently verified by the server.`;
}
