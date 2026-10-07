import {
  completionXp,
  contentKey,
  emptyProgress,
  totalXp,
  type CompletionRecord,
  type ContentRef,
  type LocalProgress,
} from "./model";

/**
 * Everything that changes progress. Actions, not whole snapshots, are what gets saved: each is
 * applied to the latest stored record inside one transaction, so a tab holding stale data can
 * never overwrite progress another tab saved in the meantime.
 */
export type ProgressAction =
  /** Every objective of a lesson or challenge passed (or a concept lesson was marked read). */
  | { type: "complete"; content: ContentRef }
  /** A submitted line ran a supported Git command; `ok` is the command's own outcome. */
  | { type: "command"; command: string; ok: boolean }
  /** A hint became visible for the first time in this attempt. */
  | { type: "hint"; content: Pick<ContentRef, "kind" | "id">; objectiveId: string; index: number }
  /** A lesson page that belongs to a course was opened. */
  | { type: "visit-lesson"; courseId: string; lessonId: string }
  /** The playground workspace loaded for a visit. */
  | { type: "playground-session" }
  /** Forget learning progress (keeps the device id and applied migrations). */
  | { type: "reset" }
  /**
   * Lesson completions confirmed by the learner's account. They replace this record's entries for
   * the same lessons (the account's first completion and XP win); lessons completed only here
   * are kept until they are uploaded.
   */
  | {
      type: "account-lessons";
      lessons: Record<string, CompletionRecord>;
      challenges?: Record<string, CompletionRecord>;
    };

/** Git subcommand names: lowercase words and dashes. Anything else is ignored. */
const COMMAND_NAME = /^[a-z][a-z-]{0,31}$/;

function touch(progress: LocalProgress, now: number): LocalProgress {
  return { ...progress, updatedAt: now, revision: progress.revision + 1 };
}

function complete(progress: LocalProgress, content: ContentRef, now: number): LocalProgress {
  const field = content.kind === "lesson" ? "completedLessons" : "completedChallenges";
  // Replays, "Practice again" and repeated completions keep the first record and its XP.
  if (progress[field][content.id]) return progress;
  const record: CompletionRecord = {
    completedAt: now,
    xp: completionXp(content),
    ...(content.kind === "lesson" ? { type: content.type } : { type: "challenge" as const }),
    ...(content.kind === "lesson" && content.courseId ? { courseId: content.courseId } : {}),
  };
  return touch(
    {
      ...progress,
      [field]: { ...progress[field], [content.id]: record },
      xp: progress.xp + record.xp,
    },
    now,
  );
}

/**
 * Applies one action. Pure: returns the same object when nothing changed (so callers can skip
 * the write), otherwise a new one with `updatedAt` and `revision` advanced.
 */
export function applyProgressAction(
  progress: LocalProgress,
  action: ProgressAction,
  now: number,
): LocalProgress {
  switch (action.type) {
    case "complete":
      return complete(progress, action.content, now);

    case "command": {
      if (!COMMAND_NAME.test(action.command)) return progress;
      const previous = progress.commandStats[action.command];
      return touch(
        {
          ...progress,
          commandStats: {
            ...progress.commandStats,
            [action.command]: {
              uses: (previous?.uses ?? 0) + 1,
              successes: (previous?.successes ?? 0) + (action.ok ? 1 : 0),
              lastUsedAt: now,
            },
          },
        },
        now,
      );
    }

    case "hint": {
      if (!Number.isInteger(action.index) || action.index < 0 || action.objectiveId === "") {
        return progress;
      }
      const key = contentKey(action.content);
      const hint = `${action.objectiveId}#${String(action.index)}`;
      const revealed = progress.revealedHints[key] ?? [];
      if (revealed.includes(hint)) return progress;
      return touch(
        { ...progress, revealedHints: { ...progress.revealedHints, [key]: [...revealed, hint] } },
        now,
      );
    }

    case "visit-lesson": {
      const last = progress.lastLesson;
      // Revisiting the same lesson only refreshes the time; keep writes rare within a minute.
      if (
        last?.courseId === action.courseId &&
        last.lessonId === action.lessonId &&
        now - last.visitedAt < 60_000
      ) {
        return progress;
      }
      return touch(
        {
          ...progress,
          lastLesson: { courseId: action.courseId, lessonId: action.lessonId, visitedAt: now },
        },
        now,
      );
    }

    case "playground-session":
      return touch({ ...progress, playgroundSessions: progress.playgroundSessions + 1 }, now);

    case "account-lessons": {
      let changed = false;
      const completedLessons = { ...progress.completedLessons };
      for (const [id, record] of Object.entries(action.lessons)) {
        const current = completedLessons[id];
        if (
          current?.completedAt === record.completedAt &&
          current.xp === record.xp &&
          current.type === record.type &&
          current.courseId === record.courseId
        ) {
          continue;
        }
        completedLessons[id] = record;
        changed = true;
      }
      const completedChallenges = { ...progress.completedChallenges };
      for (const [id, record] of Object.entries(action.challenges ?? {})) {
        const current = completedChallenges[id];
        if (
          current?.completedAt === record.completedAt &&
          current.xp === record.xp &&
          current.type === record.type
        )
          continue;
        completedChallenges[id] = record;
        changed = true;
      }
      if (!changed) return progress;
      const next = { ...progress, completedLessons, completedChallenges };
      return touch({ ...next, xp: totalXp(next) }, now);
    }

    case "reset": {
      const fresh = emptyProgress(now, { owner: progress.owner, deviceId: progress.deviceId });
      return {
        ...fresh,
        migrations: progress.migrations,
        createdAt: progress.createdAt,
        revision: progress.revision + 1,
        resetAt: now,
      };
    }
  }
}
