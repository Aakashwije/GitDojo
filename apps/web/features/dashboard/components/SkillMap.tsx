"use client";

import {
  MASTERY_RULE,
  type SkillAction,
  type SkillProgress,
  type SkillStatus,
} from "@gitdojo/progress";
import { Badge, cn, useChangeCount } from "@gitdojo/ui";
import {
  ArrowRight,
  BookOpen,
  Circle,
  CircleCheck,
  Medal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "./SectionHeading";

export const SKILL_STATUSES: Record<
  SkillStatus,
  {
    label: string;
    tone: "neutral" | "accent" | "success";
    icon: LucideIcon;
    meaning: string;
  }
> = {
  untouched: {
    label: "Not started",
    tone: "neutral",
    icon: Circle,
    meaning: "Nothing done for this skill yet.",
  },
  studied: {
    label: "Read about",
    tone: "neutral",
    icon: BookOpen,
    meaning: "Concept lessons read, nothing hands-on yet.",
  },
  practiced: {
    label: "Practiced",
    tone: "accent",
    icon: Wrench,
    meaning: "At least one hands-on lesson, challenge or practice task done.",
  },
  mastered: {
    label: "Mastered",
    tone: "success",
    icon: CircleCheck,
    meaning: `${String(MASTERY_RULE.handsOn)} hands-on completions, at least ${String(MASTERY_RULE.unguided)} without step-by-step help.`,
  },
};

const ORDER: SkillStatus[] = ["mastered", "practiced", "studied", "untouched"];

const ACTION_KINDS: Record<SkillAction["kind"], string> = {
  lesson: "Lesson",
  challenge: "Challenge",
  practice: "Practice task",
};

/** What mastery still asks for, in words, or `null` when nothing is left (or nothing begun). */
export function masteryGap(entry: SkillProgress): string | null {
  if (entry.status === "mastered" || entry.status === "untouched") return null;
  const unguided = Math.max(0, MASTERY_RULE.unguided - entry.unguided);
  // Unguided items are hands-on too, so they count towards both.
  const handsOn = Math.max(MASTERY_RULE.handsOn - entry.handsOn, unguided);
  const items = `${String(handsOn)} more hands-on ${handsOn === 1 ? "item" : "items"}`;
  return `To master: ${items}${unguided > 0 ? `, ${String(unguided)} without step-by-step help` : ""}`;
}

/**
 * Every skill as a card: its status in words and an icon, how far it is towards mastered, and the
 * one item that moves it on. Statuses follow {@link MASTERY_RULE}, the same as everywhere else.
 */
export function SkillMap({
  skills,
  actions,
}: {
  skills: SkillProgress[];
  actions: ReadonlyMap<string, SkillAction | null>;
}) {
  const counts = Object.fromEntries(
    ORDER.map((status) => [status, skills.filter((entry) => entry.status === status).length]),
  ) as Record<SkillStatus, number>;
  const practiced = counts.practiced + counts.mastered;
  return (
    <section aria-labelledby="skills-heading" data-testid="skills">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeading id="skills-heading" icon={Medal}>
          Skill map
        </SectionHeading>
        <p className="text-small text-fg-muted" data-testid="skills-summary">
          <span className="font-mono text-fg-secondary">
            {practiced} / {skills.length}
          </span>{" "}
          practiced · <span className="font-mono text-fg-secondary">{counts.mastered}</span>{" "}
          mastered
        </p>
      </div>
      <dl
        className="mt-3 grid gap-x-6 gap-y-2 text-caption sm:grid-cols-2 xl:grid-cols-4"
        data-testid="skills-explanation"
      >
        {(["untouched", "studied", "practiced", "mastered"] as const).map((status) => {
          const { label, icon: Icon, meaning } = SKILL_STATUSES[status];
          return (
            <div key={status}>
              <dt className="inline font-semibold text-fg-secondary">
                <Icon
                  className="mr-1.5 inline size-3.5 align-[-2px] text-fg-muted"
                  aria-hidden="true"
                />
                {label}
              </dt>
              <dd className="inline text-fg-muted">
                {" "}
                ({counts[status]}): {meaning}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-2 text-caption text-fg-muted">
        Counted from your completions only, the same with or without an account.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {skills.map((entry) => (
          <SkillCard key={entry.skill.id} entry={entry} action={actions.get(entry.skill.id)} />
        ))}
      </ul>
    </section>
  );
}

function SkillCard({ entry, action }: { entry: SkillProgress; action?: SkillAction | null }) {
  const { label, tone, icon: Icon } = SKILL_STATUSES[entry.status];
  // Replays the badge's entrance only when the status changes while the dashboard is open.
  const changes = useChangeCount(entry.status);
  const gap = masteryGap(entry);
  const towardsMastery = Math.min(entry.handsOn, MASTERY_RULE.handsOn);
  return (
    <li
      data-testid="skill"
      data-skill={entry.skill.id}
      data-status={entry.status}
      className={cn(
        "flex flex-col rounded-lg border bg-panel p-3.5 transition-colors duration-200 ease-out",
        entry.status === "mastered"
          ? "border-success/40"
          : entry.status === "practiced"
            ? "border-accent-border"
            : "border-border-subtle",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-small font-semibold text-fg">{entry.skill.label}</h3>
        <Badge
          key={changes}
          tone={tone}
          className={changes > 0 ? "animate-gd-pop" : undefined}
          data-testid="skill-status"
        >
          <Icon aria-hidden="true" />
          {label}
        </Badge>
      </div>
      <p className="mt-1 text-caption text-fg-muted">{entry.skill.description}</p>
      <div className="mt-3 flex items-center gap-2">
        <span aria-hidden="true" className="flex h-1 flex-1 gap-1">
          {Array.from({ length: MASTERY_RULE.handsOn }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-full flex-1 rounded-full transition-colors duration-300 ease-out",
                index < towardsMastery
                  ? entry.status === "mastered"
                    ? "bg-success"
                    : "bg-accent"
                  : "bg-border-strong",
              )}
            />
          ))}
        </span>
      </div>
      <p className="mt-1.5 text-caption text-fg-muted">
        {entry.handsOn} of {entry.available} hands-on done
        {entry.unguided > 0 ? ` · ${String(entry.unguided)} unguided` : ""}
      </p>
      {gap ? <p className="text-caption text-fg-muted">{gap}</p> : null}
      <div className="mt-auto pt-3">
        {action ? (
          <Link
            href={action.href}
            data-testid="skill-action"
            className="group flex items-start gap-1.5 rounded-md text-caption hover:text-fg"
          >
            <ArrowRight
              className="mt-0.5 size-3.5 shrink-0 text-accent transition-transform duration-150 ease-out motion-safe:group-hover:translate-x-0.5"
              aria-hidden="true"
            />
            <span>
              <span className="text-fg-muted">{action.reason}: </span>
              <span className="font-medium text-accent group-hover:underline">{action.title}</span>
              <span className="text-fg-muted"> · {ACTION_KINDS[action.kind]}</span>
            </span>
          </Link>
        ) : (
          <p className="text-caption text-fg-muted">
            {entry.status === "mastered"
              ? "Nothing left to practice here for now."
              : "Nothing new for this skill yet."}
          </p>
        )}
      </div>
    </li>
  );
}
