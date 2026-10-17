"use client";

import { dailyActivity, type ActivityDay, type LocalProgress } from "@gitdojo/progress";
import { cn } from "@gitdojo/ui";
import { ArrowRight, CalendarDays } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { SectionHeading } from "./SectionHeading";

const DAYS = 30;
const LONG_DATE = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" });
const SHORT_DATE = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function plural(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** "Friday, October 17: 2 completions (1 lesson, 1 Practice task)". */
export function describeDay(day: ActivityDay): string {
  const date = LONG_DATE.format(day.start);
  if (day.total === 0) return `${date}: no completions`;
  const parts = [
    day.lessons > 0 ? plural(day.lessons, "lesson") : null,
    day.challenges > 0 ? plural(day.challenges, "challenge") : null,
    day.practice > 0 ? plural(day.practice, "Practice task") : null,
  ].filter((part) => part !== null);
  return `${date}: ${plural(day.total, "completion")} (${parts.join(", ")})`;
}

const LEVELS = [
  "border border-border-subtle bg-surface text-transparent",
  "bg-accent-strong/25 text-fg",
  "bg-accent-strong/55 text-fg",
  "bg-accent-strong text-on-accent",
];

const level = (total: number) => LEVELS[Math.min(total, LEVELS.length - 1)];

/**
 * Days with completions over the last 30 days, as a week-by-week calendar. Each day is a cell in
 * an ARIA grid with one tab stop: arrow keys move a day (up and down) or a week (left and right),
 * and the focused or hovered day is spelled out under the grid.
 */
export function ActivityCalendar({
  progress,
  account,
  start,
}: {
  progress: LocalProgress;
  /** Signed in: completions are dated by the account when they reach it. */
  account: boolean;
  /** Where a learner with nothing to show should begin. */
  start: { href: string; label: string } | null;
}) {
  const activity = dailyActivity(progress, { days: DAYS });
  const { days } = activity;
  const today = days.length - 1;
  const [focused, setFocused] = useState(today);
  const [hovered, setHovered] = useState<number | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const first = days[0];
  const lastDay = days[today];
  if (!first || !lastDay) return null;

  // Columns are weeks, Sunday first; the first column starts on the first day's weekday.
  const offset = new Date(first.start).getDay();
  const weeks = Math.ceil((offset + days.length) / 7);
  const shown = days[hovered ?? Math.min(focused, today)] ?? lastDay;

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowUp: -1,
      ArrowDown: 1,
      ArrowLeft: -7,
      ArrowRight: 7,
    };
    let next: number;
    if (event.key in steps) next = focused + (steps[event.key] ?? 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = today;
    else return;
    event.preventDefault();
    next = Math.max(0, Math.min(today, next));
    setFocused(next);
    grid.current?.querySelector<HTMLElement>(`[data-index="${String(next)}"]`)?.focus();
  };

  return (
    <section aria-labelledby="calendar-heading" data-testid="activity-calendar">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeading id="calendar-heading" icon={CalendarDays}>
          Learning activity
        </SectionHeading>
        <p className="text-caption text-fg-muted">
          {SHORT_DATE.format(first.start)} – {SHORT_DATE.format(lastDay.start)}
        </p>
      </div>

      {activity.datedCompletions === 0 ? (
        <div
          data-testid="activity-empty"
          className="mt-4 rounded-lg border border-dashed border-border-strong bg-panel p-4"
        >
          <p className="text-small text-fg-secondary">
            {activity.undated > 0
              ? "Your earlier completions came from an older version of GitDojo without dates, so there are no days to show yet. Complete something new and it appears here."
              : "Days you complete lessons, challenges and Practice tasks show up here."}
          </p>
          {start ? (
            <Link
              href={start.href}
              className="mt-3 inline-flex items-center gap-1 text-small font-medium text-accent hover:underline"
            >
              {start.label} <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <p className="mt-2 text-small text-fg-secondary" data-testid="activity-summary">
            Active on <span className="font-mono font-semibold text-fg">{activity.activeDays}</span>{" "}
            of the last {DAYS} days
            {activity.total > 0 ? ` · ${plural(activity.total, "completion")}` : ""}
          </p>
          <div
            ref={grid}
            role="grid"
            aria-label={`Completions per day, ${SHORT_DATE.format(first.start)} to ${SHORT_DATE.format(lastDay.start)}`}
            aria-readonly="true"
            onKeyDown={move}
            onMouseLeave={() => {
              setHovered(null);
            }}
            className="mt-3 inline-grid gap-1"
          >
            {WEEKDAYS.map((weekday, row) => (
              <div role="row" key={weekday} className="flex items-center gap-1">
                <span
                  role="rowheader"
                  className="w-8 text-micro text-fg-muted"
                  aria-label={weekday}
                >
                  {/* Every other weekday labelled keeps the rows readable without crowding. */}
                  <span aria-hidden="true">{row % 2 === 1 ? weekday.slice(0, 3) : ""}</span>
                </span>
                {Array.from({ length: weeks }, (_, column) => {
                  const index = column * 7 + row - offset;
                  const day = days[index];
                  if (!day) {
                    return <span key={column} role="presentation" className="size-7" />;
                  }
                  const label = `${describeDay(day)}${index === today ? ", today" : ""}`;
                  return (
                    <div
                      key={column}
                      role="gridcell"
                      data-index={index}
                      data-date={day.date}
                      data-count={day.total}
                      tabIndex={index === focused ? 0 : -1}
                      aria-label={label}
                      title={label}
                      onFocus={() => {
                        setFocused(index);
                      }}
                      onMouseEnter={() => {
                        setHovered(index);
                      }}
                      className={cn(
                        "flex size-7 cursor-default items-center justify-center rounded-sm font-mono text-micro transition-colors duration-200 ease-out",
                        level(day.total),
                        index === today && "ring-1 ring-fg-muted ring-offset-1 ring-offset-app",
                      )}
                    >
                      <span aria-hidden="true">{day.total > 0 ? day.total : ""}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mt-2 min-h-5 text-caption text-fg-secondary" data-testid="activity-detail">
            {describeDay(shown)}
          </p>
          <div
            className="mt-2 flex items-center gap-1.5 text-micro text-fg-muted"
            aria-hidden="true"
          >
            Fewer
            {LEVELS.map((classes, index) => (
              <span key={index} className={cn("size-3 rounded-[3px]", classes)} />
            ))}
            More
          </div>
        </>
      )}
      <p className="mt-3 text-caption text-fg-muted">
        Counts the first time you complete each lesson, challenge and Practice task, by day in your
        time zone. Repeats and commands aren&apos;t dated, so they aren&apos;t counted.
        {account ? " Work done offline is dated when it reaches your account." : ""}
        {activity.undated > 0 && activity.datedCompletions > 0
          ? ` ${plural(activity.undated, "completion")} from an older version of GitDojo ${activity.undated === 1 ? "has" : "have"} no date and ${activity.undated === 1 ? "isn't" : "aren't"} shown.`
          : ""}
      </p>
    </section>
  );
}
