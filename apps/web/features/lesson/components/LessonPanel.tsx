"use client";

import { type LessonDefinition } from "@gitdojo/shared-types";
import { Badge, cn, Panel, PanelBody, PanelHeader, PanelTitle } from "@gitdojo/ui";
import { BookOpen } from "lucide-react";
import { useLessonStore } from "../state/use-lesson-store";
import { CompletionCard } from "./CompletionCard";
import { HintPanel } from "./HintPanel";
import { ObjectiveList } from "./ObjectiveList";
import { RichText } from "./RichText";

export interface LessonPanelProps {
  lesson: LessonDefinition;
  onPracticeAgain: () => void;
  className?: string;
}

export function LessonPanel({ lesson, onPracticeAgain, className }: LessonPanelProps) {
  const progress = useLessonStore((state) => state.progress);
  const revealedHints = useLessonStore((state) => state.revealedHints);
  const revealHint = useLessonStore((state) => state.revealHint);

  const currentId = progress?.currentObjectiveId ?? lesson.objectives[0]?.id ?? null;
  const hints = currentId ? (lesson.hints?.[currentId] ?? []) : [];

  return (
    <Panel aria-label="Lesson" className={cn("bg-surface", className)}>
      <PanelHeader>
        <PanelTitle>
          <BookOpen aria-hidden="true" />
          Lesson
        </PanelTitle>
        <Badge tone="neutral">{lesson.difficulty}</Badge>
      </PanelHeader>
      <PanelBody className="space-y-6">
        <div>
          <h1 className="text-h3 font-semibold text-fg">{lesson.title}</h1>
          {lesson.goal ? (
            <div className="mt-4">
              <h2 className="text-micro font-semibold tracking-wider text-fg-muted uppercase">
                Goal
              </h2>
              <p className="mt-1 text-body text-fg">{lesson.goal}</p>
            </div>
          ) : null}
          {lesson.description ? (
            <RichText text={lesson.description} className="mt-4 text-small text-fg-secondary" />
          ) : null}
        </div>

        <ObjectiveList
          objectives={lesson.objectives}
          completedIds={progress?.completedObjectiveIds ?? []}
          currentId={progress?.completed ? null : currentId}
        />

        {progress?.completed ? (
          <CompletionCard lesson={lesson} onPracticeAgain={onPracticeAgain} />
        ) : currentId ? (
          <HintPanel
            key={currentId}
            hints={hints}
            revealed={revealedHints[currentId] ?? 0}
            onReveal={() => {
              revealHint(currentId);
            }}
          />
        ) : null}
      </PanelBody>
    </Panel>
  );
}
