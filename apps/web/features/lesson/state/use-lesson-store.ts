import { createHintState, revealNext } from "@gitdojo/hints";
import { type LessonProgress } from "@gitdojo/lesson-engine";
import {
  type AdaptiveHintRecommendation,
  type HintState,
  type LessonValidationResult,
} from "@gitdojo/shared-types";
import { create } from "zustand";

interface LessonStore {
  progress: LessonProgress | null;
  validation: LessonValidationResult | null;
  /** Ids of the tips matching the current state, in authored order. */
  tips: string[];
  /** The adaptive hint rule matching the current state, if any. */
  adaptiveHint: AdaptiveHintRecommendation | null;
  /**
   * Objective id, or adaptive hint rule id, → how far down that hint ladder the learner has gone.
   * The schema keeps the two kinds of id apart.
   */
  hintStates: Record<string, HintState>;
  commandCount: number;
  completionDismissed: boolean;
  applyEvaluation: (
    validation: LessonValidationResult,
    progress: LessonProgress,
    tips?: string[],
    adaptiveHint?: AdaptiveHintRecommendation | null,
  ) => void;
  recordCommand: () => void;
  /** Shows the next of `totalHints` hints for an objective or adaptive hint rule. */
  revealHint: (id: string, totalHints: number) => void;
  dismissCompletion: () => void;
  resetAttempt: () => void;
  /** Forget everything about the previous lesson before another one loads. */
  startLesson: () => void;
}

/** View state for the active lesson. Progress itself is computed by the learning session. */
export const useLessonStore = create<LessonStore>()((set) => ({
  progress: null,
  validation: null,
  tips: [],
  adaptiveHint: null,
  hintStates: {},
  commandCount: 0,
  completionDismissed: false,
  applyEvaluation: (validation, progress, tips = [], adaptiveHint = null) => {
    set({ validation, progress, tips, adaptiveHint });
  },
  recordCommand: () => {
    set((state) => ({ commandCount: state.commandCount + 1 }));
  },
  revealHint: (id, totalHints) => {
    set((state) => {
      const current = state.hintStates[id] ?? {
        ...createHintState(id, []),
        totalHints,
      };
      return { hintStates: { ...state.hintStates, [id]: revealNext(current) } };
    });
  },
  dismissCompletion: () => {
    set({ completionDismissed: true });
  },
  resetAttempt: () => {
    set({
      tips: [],
      adaptiveHint: null,
      hintStates: {},
      commandCount: 0,
      completionDismissed: false,
    });
  },
  startLesson: () => {
    set({
      progress: null,
      validation: null,
      tips: [],
      adaptiveHint: null,
      hintStates: {},
      commandCount: 0,
      completionDismissed: false,
    });
  },
}));
