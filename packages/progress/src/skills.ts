import { type CourseLessonSummary, type LessonType } from "@gitdojo/shared-types";
import { type ProgressCatalog } from "./catalog";
import { contentKey, type LocalProgress } from "./model";

/**
 * One skill on the dashboard. Content is tagged with free-form `concepts` (`git-add`, `staging`,
 * `working-tree`...); each skill lists the concept labels that count towards it, so equivalent
 * labels group together. Skills are listed roughly in learning order.
 */
export interface SkillDefinition {
  id: string;
  label: string;
  /** Lowercase, for sentences: "Try your first {phrase} task". */
  phrase: string;
  /** What the skill covers, one line. */
  description: string;
  /** Concept labels (as normalized by {@link normalizeConcept}) that count towards it. */
  concepts: readonly string[];
}

export const SKILLS: readonly SkillDefinition[] = [
  {
    id: "repositories",
    label: "Repositories",
    phrase: "repository",
    description: "What Git is, and starting a repository.",
    concepts: ["repositories", "repository", "init", "git-init", "version-control"],
  },
  {
    id: "staging",
    label: "Staging",
    phrase: "staging",
    description: "The working tree, the staging area and git status.",
    concepts: [
      "staging",
      "staging-area",
      "add",
      "git-add",
      "status",
      "git-status",
      "working-tree",
      "file-states",
      "untracked-files",
    ],
  },
  {
    id: "commits",
    label: "Commits",
    phrase: "committing",
    description: "Recording changes with clear messages.",
    concepts: ["commits", "commit", "git-commit", "commit-messages"],
  },
  {
    id: "history",
    label: "Reading history",
    phrase: "history",
    description: "Reading the log, commits and diffs.",
    concepts: ["history", "log", "git-log", "show", "git-show", "diff", "git-diff"],
  },
  {
    id: "branches",
    label: "Branches",
    phrase: "branching",
    description: "Creating and switching branches, and what HEAD is.",
    concepts: [
      "branches",
      "branch",
      "branching",
      "git-branch",
      "switch",
      "git-switch",
      "head",
      "detached-head",
    ],
  },
  {
    id: "merging",
    label: "Merging",
    phrase: "merging",
    description: "Fast-forward and three-way merges.",
    concepts: ["merging", "merge", "fast-forward", "merge-commits", "workflow"],
  },
  {
    id: "conflicts",
    label: "Merge conflicts",
    phrase: "conflict",
    description: "Reading conflict markers and resolving conflicts.",
    concepts: ["merge-conflicts", "conflicts", "conflict-markers", "conflict-resolution"],
  },
  {
    id: "undoing",
    label: "Undoing changes",
    phrase: "undo",
    description: "Restoring files, resetting and reverting commits.",
    concepts: ["reset", "restore", "revert", "undo", "shared-history"],
  },
  {
    id: "stashing",
    label: "Stashing",
    phrase: "stashing",
    description: "Shelving unfinished work and getting it back.",
    concepts: ["stash", "stashing"],
  },
  {
    id: "cherry-picking",
    label: "Cherry-picking",
    phrase: "cherry-pick",
    description: "Copying a commit from one branch to another.",
    concepts: ["cherry-pick", "cherry-picking"],
  },
  {
    id: "recovery",
    label: "Recovering lost work",
    phrase: "recovery",
    description: "Finding lost commits with the reflog.",
    concepts: ["reflog", "recovery"],
  },
  {
    id: "rebasing",
    label: "Rebasing",
    phrase: "rebasing",
    description: "Replaying a branch on top of another.",
    concepts: ["rebase", "rebasing"],
  },
  {
    id: "rewriting-history",
    label: "Rewriting history",
    phrase: "history rewriting",
    description: "Amending, squashing and editing commits before you share them.",
    concepts: ["interactive-rebase", "squash", "amend", "rewriting-history"],
  },
  {
    id: "tags",
    label: "Tags",
    phrase: "tagging",
    description: "Naming commits, such as releases.",
    concepts: ["tags", "tag", "releases"],
  },
  {
    id: "remotes",
    label: "Remotes",
    phrase: "remote",
    description: "Fetching, pulling, pushing and tracking branches.",
    concepts: [
      "remotes",
      "remote",
      "remote-tracking-branches",
      "upstream",
      "fetch",
      "pull",
      "push",
    ],
  },
  {
    id: "housekeeping",
    label: "Ignoring and renaming files",
    phrase: "housekeeping",
    description: "Keeping files out of Git and renaming tracked files.",
    concepts: ["gitignore", "ignore", "git-mv", "mv", "renames"],
  },
];

const SKILL_BY_CONCEPT = new Map(
  SKILLS.flatMap((skill) => skill.concepts.map((concept) => [concept, skill.id] as const)),
);
const SKILL_ORDER = new Map(SKILLS.map((skill, index) => [skill.id, index]));

/** `Merge Conflicts`, `merge_conflicts` and ` merge-conflicts ` are the same label. */
export function normalizeConcept(concept: string): string {
  return concept
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

/** The skill a concept label counts towards, or `null` for a label the taxonomy does not know. */
export function skillForConcept(concept: string): string | null {
  return SKILL_BY_CONCEPT.get(normalizeConcept(concept)) ?? null;
}

/** Skill ids for a list of concepts, de-duplicated, in taxonomy order. */
export function skillsForConcepts(concepts: readonly string[]): string[] {
  const ids = new Set(concepts.map(skillForConcept).filter((id) => id !== null));
  return [...ids].sort((a, b) => (SKILL_ORDER.get(a) ?? 0) - (SKILL_ORDER.get(b) ?? 0));
}

export function isSkillId(id: string): boolean {
  return SKILL_ORDER.has(id);
}

/**
 * - `untouched`: nothing done yet.
 * - `studied`: only concept lessons read, nothing hands-on.
 * - `practiced`: at least one hands-on lesson, challenge or practice task solved.
 * - `mastered`: see {@link MASTERY_RULE}. One completion is never mastery.
 */
export type SkillStatus = "untouched" | "studied" | "practiced" | "mastered";

/** Mastered means repeated, and at least once without step-by-step guidance. */
export const MASTERY_RULE = { handsOn: 3, unguided: 1 } as const;

export interface SkillProgress {
  skill: SkillDefinition;
  status: SkillStatus;
  /** Hands-on items solved: interactive or challenge lessons, challenges and practice tasks. */
  handsOn: number;
  /** Of those, solved without step-by-step guidance: challenges and practice tasks. */
  unguided: number;
  /** Concept lessons marked complete. */
  read: number;
  /** Hands-on items the current content offers for this skill. */
  available: number;
}

/** A completable item with the skills its content is tagged with. */
interface SkillItem {
  key: string;
  handsOn: boolean;
  unguided: boolean;
  skills: string[];
}

function lessonItem(
  lesson: Pick<CourseLessonSummary, "id">,
  type: LessonType,
  catalog: ProgressCatalog,
): SkillItem {
  const key = contentKey({ kind: "lesson", id: lesson.id });
  return {
    key,
    handsOn: type !== "concept",
    unguided: type === "challenge",
    skills: skillsForConcepts(catalog.concepts[key] ?? []),
  };
}

/** Every item in the catalog with its skills. Content that no longer exists is not included. */
function skillItems(catalog: ProgressCatalog): SkillItem[] {
  const lessons = catalog.courses.flatMap((course) =>
    course.lessons.map((lesson) => lessonItem(lesson, lesson.type, catalog)),
  );
  const standalone = catalog.lessons.map((lesson) => lessonItem(lesson, lesson.type, catalog));
  const challenges = catalog.challenges.map((challenge) => {
    const key = contentKey({ kind: "challenge", id: challenge.id });
    return {
      key,
      handsOn: true,
      unguided: true,
      skills: skillsForConcepts(catalog.concepts[key] ?? []),
    };
  });
  const practice = catalog.practice.map((task) => {
    const key = contentKey({ kind: "practice", id: task.id });
    const skills = skillsForConcepts(catalog.concepts[key] ?? []);
    return {
      key,
      handsOn: true,
      unguided: true,
      skills: skills.includes(task.skill) ? skills : [task.skill, ...skills],
    };
  });
  // A standalone lesson can share an id with a course lesson; count each content key once.
  const unique = new Map<string, SkillItem>();
  for (const item of [...lessons, ...standalone, ...challenges, ...practice]) {
    if (!unique.has(item.key)) unique.set(item.key, item);
  }
  return [...unique.values()];
}

function completedKeys(progress: LocalProgress): Set<string> {
  return new Set([
    ...Object.keys(progress.completedLessons).map((id) => contentKey({ kind: "lesson", id })),
    ...Object.keys(progress.completedChallenges).map((id) => contentKey({ kind: "challenge", id })),
    ...Object.keys(progress.completedPractice).map((id) => contentKey({ kind: "practice", id })),
  ]);
}

/**
 * How far the learner has come with every skill, in taxonomy order. Derived from completions and
 * the content's concept tags only, the same for anonymous and account progress.
 */
export function skillProgress(progress: LocalProgress, catalog: ProgressCatalog): SkillProgress[] {
  const items = skillItems(catalog);
  const done = completedKeys(progress);
  return SKILLS.map((skill) => {
    const tagged = items.filter((item) => item.skills.includes(skill.id));
    const solved = tagged.filter((item) => done.has(item.key));
    const handsOn = solved.filter((item) => item.handsOn).length;
    const unguided = solved.filter((item) => item.unguided).length;
    const read = solved.filter((item) => !item.handsOn).length;
    const status: SkillStatus =
      handsOn >= MASTERY_RULE.handsOn && unguided >= MASTERY_RULE.unguided
        ? "mastered"
        : handsOn > 0
          ? "practiced"
          : read > 0
            ? "studied"
            : "untouched";
    return {
      skill,
      status,
      handsOn,
      unguided,
      read,
      available: tagged.filter((item) => item.handsOn).length,
    };
  });
}
