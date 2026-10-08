"use client";

import { type ChallengeSummary } from "@gitdojo/shared-types";
import { Badge, Button, cn } from "@gitdojo/ui";
import { ArrowRight, CircleCheck, Lock } from "lucide-react";
import Link from "next/link";
import { renderInline } from "@/components/content/rich-text";
import { challengeHref, describeMissing, isPlayable } from "../services/challenge-navigation";

export function ChallengeCard({
  challenge,
  solved,
}: {
  challenge: ChallengeSummary;
  solved: boolean;
}) {
  const playable = isPlayable(challenge);
  return (
    <article
      data-testid="challenge-card"
      data-challenge={challenge.id}
      data-state={!playable ? "locked" : solved ? "solved" : "open"}
      className={cn(
        "flex flex-col rounded-xl border border-border bg-panel p-5 transition-[border-color,transform] duration-200",
        playable ? "hover:-translate-y-0.5 hover:border-border-strong" : "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-caption text-fg-muted">
          {String(challenge.number).padStart(2, "0")}
        </span>
        <Badge tone="neutral">{challenge.difficulty}</Badge>
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
      <h3 className="mt-3 text-h4 font-semibold text-fg">
        {playable ? (
          <Link href={challengeHref(challenge.id)} className="hover:underline">
            {challenge.title}
          </Link>
        ) : (
          challenge.title
        )}
      </h3>
      <p className="mt-2 line-clamp-3 flex-1 text-small text-fg-secondary">
        {renderInline(challenge.mission)}
      </p>
      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Concepts">
        {challenge.concepts.map((concept) => (
          <li
            key={concept}
            className="rounded-sm border border-border-subtle bg-elevated px-1.5 font-mono text-micro text-fg-muted"
          >
            {concept}
          </li>
        ))}
      </ul>
      {playable ? (
        <Button asChild variant={solved ? "secondary" : "primary"} className="mt-5 self-start">
          <Link href={challengeHref(challenge.id)}>
            {solved ? "Solve again" : "Start"} <ArrowRight />
          </Link>
        </Button>
      ) : (
        <p className="mt-5 text-caption text-fg-muted">
          Needs {describeMissing(challenge.missingCommands)}, which GitDojo does not support yet.
        </p>
      )}
    </article>
  );
}
