import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface CourseProgressStore {
  /** Lesson id → completed. Lesson ids are unique across courses. */
  completedLessons: Record<string, true>;
  /** False until saved progress has been read from the browser. */
  hydrated: boolean;
  markLessonComplete: (lessonId: string) => void;
}

/**
 * Which lessons the learner has finished, saved in localStorage until accounts exist.
 * Hydration is manual so the server render and the first client render agree.
 */
export const useCourseProgressStore = create<CourseProgressStore>()(
  persist(
    (set) => ({
      completedLessons: {},
      hydrated: false,
      markLessonComplete: (lessonId) => {
        set((state) =>
          state.completedLessons[lessonId]
            ? state
            : { completedLessons: { ...state.completedLessons, [lessonId]: true } },
        );
      },
    }),
    {
      name: "gitdojo:course-progress",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ completedLessons: state.completedLessons }),
      // Union rather than replace, so a lesson finished before hydration is not forgotten.
      merge: (persisted, current) => {
        const saved = (persisted as Partial<CourseProgressStore> | undefined)?.completedLessons;
        return { ...current, completedLessons: { ...saved, ...current.completedLessons } };
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

/** Completed lesson ids, empty until saved progress has loaded. */
export function useCompletedLessons(): { completed: ReadonlySet<string>; hydrated: boolean } {
  const completedLessons = useCourseProgressStore((state) => state.completedLessons);
  const hydrated = useCourseProgressStore((state) => state.hydrated);
  useEffect(hydrateOnce, []);
  const completed = useMemo(() => new Set(Object.keys(completedLessons)), [completedLessons]);
  return { completed, hydrated };
}
