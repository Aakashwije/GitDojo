import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface CourseProgressStore {
  /** Lesson id → completed. Lesson ids are unique across courses. */
  completedLessons: Record<string, true>;
  /** Challenge id → completed. Challenges have their own ids, separate from lessons. */
  completedChallenges: Record<string, true>;
  /** False until saved progress has been read from the browser. */
  hydrated: boolean;
  markLessonComplete: (lessonId: string) => void;
  markChallengeComplete: (challengeId: string) => void;
}

type SavedProgress = Partial<Pick<CourseProgressStore, "completedLessons" | "completedChallenges">>;

/**
 * Which lessons the learner has finished, saved in localStorage until accounts exist.
 * Hydration is manual so the server render and the first client render agree.
 */
export const useCourseProgressStore = create<CourseProgressStore>()(
  persist(
    (set) => ({
      completedLessons: {},
      completedChallenges: {},
      hydrated: false,
      markLessonComplete: (lessonId) => {
        set((state) =>
          state.completedLessons[lessonId]
            ? state
            : { completedLessons: { ...state.completedLessons, [lessonId]: true } },
        );
      },
      markChallengeComplete: (challengeId) => {
        set((state) =>
          state.completedChallenges[challengeId]
            ? state
            : { completedChallenges: { ...state.completedChallenges, [challengeId]: true } },
        );
      },
    }),
    {
      name: "gitdojo:course-progress",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        completedLessons: state.completedLessons,
        completedChallenges: state.completedChallenges,
      }),
      // Version 1 only had lessons; its data carries over unchanged.
      migrate: (persisted) => persisted as SavedProgress,
      // Union rather than replace, so a lesson finished before hydration is not forgotten.
      merge: (persisted, current) => {
        const saved = persisted as SavedProgress | undefined;
        return {
          ...current,
          completedLessons: { ...saved?.completedLessons, ...current.completedLessons },
          completedChallenges: { ...saved?.completedChallenges, ...current.completedChallenges },
        };
      },
      skipHydration: true,
    },
  ),
);

let hydration: Promise<void> | null = null;

function hydrateOnce(): void {
  hydration ??= Promise.resolve(useCourseProgressStore.persist.rehydrate())
    .catch((error: unknown) => {
      // Storage can be unavailable (e.g. private browsing); progress then lasts for the visit.
      console.warn("[gitdojo] could not restore course progress", error);
    })
    .finally(() => {
      useCourseProgressStore.setState({ hydrated: true });
    });
}

/** Completed challenge ids, empty until saved progress has loaded. */
export function useCompletedChallenges(): {
  completed: ReadonlySet<string>;
  hydrated: boolean;
} {
  const completedChallenges = useCourseProgressStore((state) => state.completedChallenges);
  const hydrated = useCourseProgressStore((state) => state.hydrated);
  useEffect(hydrateOnce, []);
  const completed = useMemo(() => new Set(Object.keys(completedChallenges)), [completedChallenges]);
  return { completed, hydrated };
}

/** Completed lesson ids, empty until saved progress has loaded. */
export function useCompletedLessons(): { completed: ReadonlySet<string>; hydrated: boolean } {
  const completedLessons = useCourseProgressStore((state) => state.completedLessons);
  const hydrated = useCourseProgressStore((state) => state.hydrated);
  useEffect(hydrateOnce, []);
  const completed = useMemo(() => new Set(Object.keys(completedLessons)), [completedLessons]);
  return { completed, hydrated };
}
