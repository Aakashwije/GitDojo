import { type Hint, type HintState } from "@gitdojo/shared-types";

export function createHintState(objectiveId: string, hints: readonly Hint[]): HintState {
  return { objectiveId, revealedHints: 0, totalHints: hints.length };
}

/** One more hint shown, never past the last one. */
export function revealNext(state: HintState): HintState {
  return { ...state, revealedHints: Math.min(state.revealedHints + 1, state.totalHints) };
}

export function visibleHints(hints: readonly Hint[], state: HintState | undefined): Hint[] {
  return hints.slice(0, Math.min(state?.revealedHints ?? 0, hints.length));
}

/** The hint the next reveal would show, or `null` when all are visible. */
export function nextHint(hints: readonly Hint[], state: HintState | undefined): Hint | null {
  return hints[state?.revealedHints ?? 0] ?? null;
}

/** Total hints revealed across objectives, e.g. for a completion summary. */
export function hintsUsed(states: Readonly<Record<string, HintState>>): number {
  return Object.values(states).reduce((sum, state) => sum + state.revealedHints, 0);
}

/** True when the learner has seen an exact command (a level-3 hint) for any objective. */
export function revealedAnswer(
  states: Readonly<Record<string, HintState>>,
  hintsFor: (objectiveId: string) => readonly Hint[],
): boolean {
  return Object.values(states).some((state) =>
    visibleHints(hintsFor(state.objectiveId), state).some((hint) => hint.level === 3),
  );
}
