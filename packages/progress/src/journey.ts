import { type CourseOutline } from "@gitdojo/shared-types";
import { type LocalProgress } from "./model";
import {
  completedLessonIds,
  continueLearning,
  courseProgress,
  type ContinueTarget,
  type CourseProgress,
} from "./selectors";

/**
 * - `completed`: every lesson of the course is done.
 * - `current`: the course "Continue learning" points into.
 * - `available`: started, or skipped past, but not the current course: open to pick up.
 * - `upcoming`: not started yet, after the current course.
 */
export type MilestoneStatus = "completed" | "current" | "available" | "upcoming";

export interface JourneyMilestone {
  course: CourseOutline;
  progress: CourseProgress;
  status: MilestoneStatus;
}

export interface LearningJourney {
  /** Lessons completed across every course; standalone lessons are not part of the journey. */
  completed: number;
  total: number;
  /** Whole percent, 0–100. */
  percent: number;
  /** Where to carry on; `null` once every course is complete. */
  target: ContinueTarget | null;
  /** Every course in catalog order. */
  milestones: JourneyMilestone[];
}

/**
 * The courses as milestones on one path, derived from the same selectors as course progress and
 * "Continue learning", so the journey can never disagree with them.
 */
export function learningJourney(
  progress: LocalProgress,
  courses: readonly CourseOutline[],
): LearningJourney {
  const done = completedLessonIds(progress);
  const target = continueLearning(progress, courses);
  const currentIndex = target ? courses.findIndex((course) => course.id === target.course.id) : -1;
  const milestones = courses.map((course, index): JourneyMilestone => {
    const value = courseProgress(course, done);
    const status: MilestoneStatus =
      value.total > 0 && value.completedCount === value.total
        ? "completed"
        : index === currentIndex
          ? "current"
          : value.completedCount > 0 || index < currentIndex
            ? "available"
            : "upcoming";
    return { course, progress: value, status };
  });
  const completed = milestones.reduce((sum, item) => sum + item.progress.completedCount, 0);
  const total = milestones.reduce((sum, item) => sum + item.progress.total, 0);
  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    target,
    milestones,
  };
}
