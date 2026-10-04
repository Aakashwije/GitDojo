"use client";

import { type ChallengeCategoryInfo } from "@gitdojo/challenge-engine";
import { type ChallengeSummary, type LessonDifficulty } from "@gitdojo/shared-types";
import { cn } from "@gitdojo/ui";
import { useState } from "react";
import { useCompletedChallenges } from "@/features/course/state/use-course-progress";
import { isPlayable } from "../services/challenge-navigation";
import { ChallengeCard } from "./ChallengeCard";

type DifficultyFilter = LessonDifficulty | "all";

const FILTERS: { id: DifficultyFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

export interface ChallengeBrowserProps {
  challenges: ChallengeSummary[];
  categories: readonly ChallengeCategoryInfo[];
}

/** Challenges grouped by category, with a difficulty filter and saved progress. */
export function ChallengeBrowser({ challenges, categories }: ChallengeBrowserProps) {
  const { completed, hydrated } = useCompletedChallenges();
  const [filter, setFilter] = useState<DifficultyFilter>("all");
  const visible = challenges.filter((c) => filter === "all" || c.difficulty === filter);
  const playable = challenges.filter(isPlayable);
  const solved = playable.filter((c) => completed.has(c.id)).length;

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div
          role="group"
          aria-label="Difficulty"
          className="flex gap-1 rounded-lg border border-border bg-surface p-1"
        >
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
              }}
              className={cn(
                "rounded-md px-3 py-1 text-small transition-colors",
                filter === id ? "bg-elevated text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-small text-fg-muted" data-testid="challenges-solved" aria-live="polite">
          {hydrated ? (
            <>
              <span className="font-mono text-fg-secondary">
                {solved} / {playable.length}
              </span>{" "}
              solved
            </>
          ) : null}
        </p>
      </div>

      {categories.map((category) => {
        const items = visible.filter((challenge) => challenge.category === category.id);
        if (items.length === 0) return null;
        return (
          <section key={category.id} aria-labelledby={`category-${category.id}`} className="mt-10">
            <h2 id={`category-${category.id}`} className="text-h4 font-semibold text-fg">
              {category.title}
            </h2>
            <p className="mt-1 text-small text-fg-muted">{category.description}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((challenge) => (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  solved={completed.has(challenge.id)}
                />
              ))}
            </div>
          </section>
        );
      })}
      {visible.length === 0 ? (
        <p className="mt-10 text-small text-fg-muted">No challenges at this difficulty yet.</p>
      ) : null}
    </>
  );
}
