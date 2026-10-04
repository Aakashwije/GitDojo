import { createHintState, revealNext } from "@gitdojo/hints";
import { type LessonProgress } from "@gitdojo/lesson-engine";
import { type HintState, type LessonValidationResult } from "@gitdojo/shared-types";
import { create } from "zustand";

interface LessonStore {
  progress: LessonProgress | null;
  validation: LessonValidationResult | null;
  /** Objective id → how far down its hint ladder the learner has gone. */
  hintStates: Record<string, HintState>;
  commandCount: number;
  completionDismissed: boolean;
  applyEvaluation: (validation: LessonValidationResult, progress: LessonProgress) => void;
  recordCommand: () => void;
  /** Shows the next of `totalHints` hints for an objective. */
  revealHint: (objectiveId: string, totalHints: number) => void;
  dismissCompletion: () => void;
  resetAttempt: () => void;
  /** Forget everything about the previous lesson before another one loads. */
  startLesson: () => void;
}

/** View state for the active lesson. Progress itself is computed by the learning session. */
export const useLessonStore = create<LessonStore>()((set) => ({
  progress: null,
  validation: null,
  hintStates: {},
  commandCount: 0,
  completionDismissed: false,
  applyEvaluation: (validation, progress) => {
    set({ validation, progress });
  },
  recordCommand: () => {
    set((state) => ({ commandCount: state.commandCount + 1 }));
  },
  revealHint: (objectiveId, totalHints) => {
    set((state) => {
      const current = state.hintStates[objectiveId] ?? {
        ...createHintState(objectiveId, []),
        totalHints,
      };
      return { hintStates: { ...state.hintStates, [objectiveId]: revealNext(current) } };
    });
  },
  dismissCompletion: () => {
    set({ completionDismissed: true });
  },
  resetAttempt: () => {
    set({ hintStates: {}, commandCount: 0, completionDismissed: false });
  },
  startLesson: () => {
    set({
      progress: null,
      validation: null,
      hintStates: {},
      commandCount: 0,
      completionDismissed: false,
    });
  },
}));
