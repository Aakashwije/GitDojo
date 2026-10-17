import { type LocalProgress } from "./model";

/** One calendar day of learning, in the learner's own time zone. */
export interface ActivityDay {
  /** `YYYY-MM-DD`, local to the device showing it. */
  date: string;
  /** Midnight at the start of the day, ms since the epoch. */
  start: number;
  lessons: number;
  challenges: number;
  practice: number;
  /** Everything first completed that day. */
  total: number;
}

export interface DailyActivity {
  /** Oldest first, ending with today. */
  days: ActivityDay[];
  /** Days in the range with at least one completion. */
  activeDays: number;
  /** Completions in the range. */
  total: number;
  /** Completions with a real date, at any time: none means there is nothing to show yet. */
  datedCompletions: number;
  /** Completions imported from the pre-IndexedDB format, whose real date is unknown. */
  undated: number;
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${String(date.getFullYear())}-${month}-${day}`;
}

/**
 * Completions per day for the last `days` days, today included, in the device's local time.
 *
 * Only the first completion of each lesson, challenge or Practice task is stored, with its date,
 * so that is what is counted: repeating a task and running commands are not dated and never
 * appear. Completions migrated from the old format carry the migration time, not the day the
 * work was done, so they are left out and reported as `undated` instead of piling onto one day.
 */
export function dailyActivity(
  progress: LocalProgress,
  { days = 30, now = Date.now() }: { days?: number; now?: number } = {},
): DailyActivity {
  const today = new Date(now);
  const range: ActivityDay[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    // Calendar arithmetic, so a daylight saving change never skips or repeats a day.
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    range.push({
      date: dayKey(start),
      start: start.getTime(),
      lessons: 0,
      challenges: 0,
      practice: 0,
      total: 0,
    });
  }
  const byDate = new Map(range.map((day) => [day.date, day]));

  let datedCompletions = 0;
  let undated = 0;
  const count = (
    records: LocalProgress["completedLessons"],
    field: "lessons" | "challenges" | "practice",
  ) => {
    for (const record of Object.values(records)) {
      if (record.migrated) {
        undated += 1;
        continue;
      }
      datedCompletions += 1;
      const day = byDate.get(dayKey(new Date(record.completedAt)));
      if (!day) continue;
      day[field] += 1;
      day.total += 1;
    }
  };
  count(progress.completedLessons, "lessons");
  count(progress.completedChallenges, "challenges");
  count(progress.completedPractice, "practice");

  return {
    days: range,
    activeDays: range.filter((day) => day.total > 0).length,
    total: range.reduce((sum, day) => sum + day.total, 0),
    datedCompletions,
    undated,
  };
}
