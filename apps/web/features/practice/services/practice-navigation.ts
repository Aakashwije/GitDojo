import { SKILLS } from "@gitdojo/progress";
import { type LessonDifficulty, type PracticeTaskSummary } from "@gitdojo/shared-types";

export function practiceHref(id: string): string {
  return `/practice/${id}`;
}

/** The skill's display name, or the id itself for one the taxonomy does not know. */
export function skillLabel(id: string): string {
  return SKILLS.find((skill) => skill.id === id)?.label ?? id;
}

export const DIFFICULTIES: { id: LessonDifficulty; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

export interface PracticeFilter {
  /** A skill id, or `all`. */
  skill: string;
  difficulty: LessonDifficulty | "all";
}

export const NO_FILTER: PracticeFilter = { skill: "all", difficulty: "all" };

export function matchesFilter(task: PracticeTaskSummary, filter: PracticeFilter): boolean {
  return (
    (filter.skill === "all" || task.skill === filter.skill) &&
    (filter.difficulty === "all" || task.difficulty === filter.difficulty)
  );
}

/** Skills that have at least one task, in taxonomy order, for the topic picker. */
export function practiceSkills(tasks: readonly PracticeTaskSummary[]) {
  return SKILLS.filter((skill) => tasks.some((task) => task.skill === skill.id));
}
