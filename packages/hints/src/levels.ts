import { type Hint, type HintLevel, type LessonHintInput } from "@gitdojo/shared-types";

export interface HintLevelInfo {
  level: HintLevel;
  label: string;
  description: string;
}

export const HINT_LEVELS: Record<HintLevel, HintLevelInfo> = {
  1: { level: 1, label: "Concept", description: "A nudge towards the idea, not the command." },
  2: { level: 2, label: "Command", description: "Which command (family) does the job." },
  3: { level: 3, label: "Answer", description: "The exact command to run." },
};

/** A hint that shows a Git command in backticks, e.g. "Run `git add README.md`." */
const COMMAND = /`git [^`]+`/;

export function namesCommand(text: string): boolean {
  return COMMAND.test(text);
}

export interface NormalizeOptions {
  /** Challenges never give away the exact command: inferred levels stop at 2. */
  challenge?: boolean;
}

/**
 * Settles every hint's level. Explicit levels win. Plain strings are levelled by position, the way
 * GitDojo's hints have always been written (vague first, explicit last): the first is a concept,
 * the last is the answer when it names a Git command, and everything between names the command
 * family. Levels never go down along the ladder.
 */
export function normalizeHints(
  hints: readonly LessonHintInput[] | undefined,
  { challenge = false }: NormalizeOptions = {},
): Hint[] {
  const list = hints ?? [];
  let previous: HintLevel = 1;
  return list.map((hint, index): Hint => {
    let level: HintLevel;
    if (typeof hint !== "string") {
      level = hint.level;
    } else if (index === 0) {
      level = list.length === 1 && !challenge && namesCommand(hint) ? 3 : 1;
    } else if (index === list.length - 1 && !challenge && namesCommand(hint)) {
      level = 3;
    } else {
      level = 2;
    }
    level = Math.max(level, previous) as HintLevel;
    if (challenge && typeof hint === "string") level = Math.min(level, 2) as HintLevel;
    previous = level;
    return { level, text: typeof hint === "string" ? hint : hint.text };
  });
}

/**
 * Problems with an authored hint ladder, as messages for content validation:
 * explicit levels must not go down, a level-3 hint must name the command, and challenges must
 * not prescribe commands at all.
 */
export function hintIssues(
  hints: readonly LessonHintInput[],
  { challenge = false }: NormalizeOptions = {},
): { index: number; message: string }[] {
  const issues: { index: number; message: string }[] = [];
  let previous = 0;
  for (const [index, hint] of hints.entries()) {
    if (typeof hint === "string") continue;
    if (hint.level < previous) {
      issues.push({ index, message: "hint levels must not go down (concept → command → answer)" });
    }
    if (hint.level === 3 && challenge) {
      issues.push({ index, message: "challenges must not give the exact command (level 3)" });
    } else if (hint.level === 3 && !namesCommand(hint.text)) {
      issues.push({ index, message: "a level 3 hint must name the command, in backticks" });
    }
    previous = hint.level;
  }
  return issues;
}
