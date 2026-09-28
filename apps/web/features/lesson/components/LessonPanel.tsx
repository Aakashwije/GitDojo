"use client";

import { lessonTypeOf, type LessonDefinition } from "@gitdojo/shared-types";
import { Badge, cn, Panel, PanelBody, PanelFooter, PanelHeader, PanelTitle } from "@gitdojo/ui";
import { BookOpen, Flag } from "lucide-react";
import { LessonPager } from "@/features/course/components/LessonPager";
import {
  formatLessonNumber,
  type LessonNeighbors,
} from "@/features/course/services/course-navigation";
import { useLessonStore } from "../state/use-lesson-store";
import { CompletionCard } from "./CompletionCard";
import { LessonContent } from "./content/LessonContent";
import { HintPanel } from "./HintPanel";
import { ObjectiveList } from "./ObjectiveList";
import { renderInline, RichText } from "./RichText";

export interface LessonPanelProps {
  lesson: LessonDefinition;
  /** Where the lesson sits in its course, when it belongs to one. */
  course?: { slug: string; position: LessonNeighbors };
  onPracticeAgain: () => void;
  className?: string;
}

export function LessonPanel({ lesson, course, onPracticeAgain, className }: LessonPanelProps) {
  // Ignore progress left over from the previous lesson until this one has loaded.
  const progress = useLessonStore((state) =>
    state.progress?.lessonId === lesson.id ? state.progress : null,
  );
  const revealedHints = useLessonStore((state) => state.revealedHints);
  const revealHint = useLessonStore((state) => state.revealHint);

  const currentId = progress?.currentObjectiveId ?? lesson.objectives[0]?.id ?? null;
  const hints = currentId ? (lesson.hints?.[currentId] ?? []) : [];
  const challenge = lessonTypeOf(lesson) === "challenge";

  return (
    <Panel aria-label="Lesson" className={cn("bg-surface", className)}>
      <PanelHeader>
        <PanelTitle>
          {challenge ? <Flag aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
          {challenge ? "Challenge" : "Lesson"}
          {course ? (
            <span className="font-mono text-caption font-normal text-fg-muted">
              {formatLessonNumber(course.position.lesson.number)}
            </span>
          ) : null}
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
              <p className="mt-1 text-body text-fg">{renderInline(lesson.goal)}</p>
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

        {lesson.content && lesson.content.length > 0 ? (
          <section
            aria-labelledby="reference-heading"
            className="border-t border-border-subtle pt-5"
          >
            <h2
              id="reference-heading"
              className="mb-3 text-micro font-semibold tracking-wider text-fg-muted uppercase"
            >
              Reference
            </h2>
            <LessonContent blocks={lesson.content} headingLevel={3} className="space-y-6" />
          </section>
        ) : null}
      </PanelBody>
      {course ? (
        <PanelFooter className="px-2 py-2">
          <LessonPager
            courseSlug={course.slug}
            position={course.position}
            emphasizeNext={progress?.completed ?? false}
          />
        </PanelFooter>
      ) : null}
    </Panel>
  );
}
