import { type LessonProgress } from "@gitdojo/lesson-engine";
import { type LessonValidationResult } from "@gitdojo/shared-types";
import { create } from "zustand";

interface LessonStore {
  progress: LessonProgress | null;
  validation: LessonValidationResult | null;
  /** Objective id → number of hints revealed. */
  revealedHints: Record<string, number>;
  commandCount: number;
  completionDismissed: boolean;
  applyEvaluation: (validation: LessonValidationResult, progress: LessonProgress) => void;
  recordCommand: () => void;
  revealHint: (objectiveId: string) => void;
  dismissCompletion: () => void;
  resetAttempt: () => void;
}

/** View state for the active lesson. Progress itself is computed by the learning session. */
export const useLessonStore = create<LessonStore>()((set) => ({
  progress: null,
  validation: null,
  revealedHints: {},
  commandCount: 0,
  completionDismissed: false,
  applyEvaluation: (validation, progress) => {
    set({ validation, progress });
  },
  recordCommand: () => {
    set((state) => ({ commandCount: state.commandCount + 1 }));
  },
  revealHint: (objectiveId) => {
    set((state) => ({
      revealedHints: {
        ...state.revealedHints,
        [objectiveId]: (state.revealedHints[objectiveId] ?? 0) + 1,
      },
    }));
  },
  dismissCompletion: () => {
    set({ completionDismissed: true });
  },
  resetAttempt: () => {
    set({ revealedHints: {}, commandCount: 0, completionDismissed: false });
  },
}));
