"use client";

import { pickSurpriseTask } from "@gitdojo/progress";
import { type PracticeTaskSummary } from "@gitdojo/shared-types";
import { Badge, Button, cn } from "@gitdojo/ui";
import { ArrowRight, CircleCheck, Lock, Shuffle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { renderInline } from "@/components/content/rich-text";
import { useSolvedPractice } from "@/features/progress";
import {
  DIFFICULTIES,
  matchesFilter,
  NO_FILTER,
  practiceHref,
  practiceSkills,
  skillLabel,
  type PracticeFilter,
} from "../services/practice-navigation";

export interface PracticeBrowserProps {
  tasks: PracticeTaskSummary[];
}

/**
 * Practice mode's entry point: pick a topic or difficulty, or let "Surprise me" choose a task.
 * Every task is short, unguided and checked against the repository's end state.
 */
export function PracticeBrowser({ tasks }: PracticeBrowserProps) {
  const router = useRouter();
  const { solved, hydrated } = useSolvedPractice();
  const [filter, setFilter] = useState<PracticeFilter>(NO_FILTER);
  // Each press moves on, so "Surprise me" twice in a row never repeats itself.
  const [presses, setPresses] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const topicId = useId();
  const visible = tasks.filter((task) => matchesFilter(task, filter));
  const playable = tasks.filter((task) => task.missingCommands.length === 0);
  const solvedCount = playable.filter((task) => solved[task.id] !== undefined).length;

  const surprise = () => {
    const pick = pickSurpriseTask(visible, {
      solved,
      seed: presses + Object.keys(solved).length,
    });
    setPresses((count) => count + 1);
    if (!pick) {
      setMessage("No playable task matches this topic and difficulty.");
      return;
    }
    setMessage(`Opening ${tasks.find((task) => task.id === pick.id)?.title ?? pick.id}…`);
    router.push(practiceHref(pick.id));
  };

  return (
    <>
      <div className="mt-8 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={topicId} className="text-caption font-semibold text-fg-secondary">
            Topic
          </label>
          <select
            id={topicId}
            value={filter.skill}
            onChange={(event) => {
              setFilter({ ...filter, skill: event.target.value });
            }}
            className="focus-visible:border-border-focus h-9 rounded-md border border-border-input bg-panel px-3 text-small text-fg"
          >
            <option value="all">All topics</option>
            {practiceSkills(tasks).map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.label}
              </option>
            ))}
          </select>
        </div>
        <div
          role="group"
          aria-label="Difficulty"
          className="flex gap-1 rounded-lg border border-border bg-surface p-1"
        >
          {[{ id: "all" as const, label: "All" }, ...DIFFICULTIES].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter.difficulty === id}
              onClick={() => {
                setFilter({ ...filter, difficulty: id });
              }}
              className={cn(
                "rounded-md px-3 py-1 text-small transition-colors",
                filter.difficulty === id ? "bg-elevated text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="primary" onClick={surprise} data-testid="surprise-me">
          <Shuffle /> Surprise me
        </Button>
        <p className="ml-auto text-small text-fg-muted" data-testid="practice-solved">
          {hydrated ? (
            <>
              <span className="font-mono text-fg-secondary">
                {solvedCount} / {playable.length}
              </span>{" "}
              solved
            </>
          ) : null}
        </p>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-small text-fg-muted">
        {message}
      </p>

      {visible.length === 0 ? (
        <p className="mt-6 text-small text-fg-muted">No practice tasks match these filters yet.</p>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Practice tasks">
          {visible.map((task) => (
            <li key={task.id}>
              <PracticeCard task={task} solved={solved[task.id] !== undefined} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function PracticeCard({ task, solved }: { task: PracticeTaskSummary; solved: boolean }) {
  const playable = task.missingCommands.length === 0;
  return (
    <article
      data-testid="practice-card"
      data-task={task.id}
      data-state={!playable ? "locked" : solved ? "solved" : "open"}
      className={cn(
        "flex h-full flex-col rounded-xl border border-border bg-panel p-5 transition-[border-color,transform] duration-200 motion-reduce:transition-none",
        playable
          ? "hover:-translate-y-0.5 hover:border-border-strong motion-reduce:hover:translate-y-0"
          : "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="branch">{skillLabel(task.skill)}</Badge>
        <Badge tone="neutral">{task.difficulty}</Badge>
        {solved ? (
          <Badge tone="success">
            <CircleCheck aria-hidden="true" /> Solved
          </Badge>
        ) : null}
        {!playable ? (
          <Badge tone="neutral">
            <Lock aria-hidden="true" /> Coming soon
          </Badge>
        ) : null}
      </div>
      <h3 className="mt-3 text-h4 font-semibold text-fg">{task.title}</h3>
      <p className="mt-2 flex-1 text-small text-fg-secondary">{renderInline(task.mission)}</p>
      {playable ? (
        <Button
          asChild
          variant={solved ? "secondary" : "primary"}
          size="sm"
          className="mt-4 self-start"
        >
          <Link
            href={practiceHref(task.id)}
            aria-label={`${solved ? "Practice again" : "Start"}: ${task.title}`}
          >
            {solved ? "Practice again" : "Start"} <ArrowRight />
          </Link>
        </Button>
      ) : null}
    </article>
  );
}
