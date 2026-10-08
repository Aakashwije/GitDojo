"use client";

import { normalizeHints } from "@gitdojo/hints";
import { type ContentRef } from "@gitdojo/progress";
import { lessonTypeOf, type LessonDefinition } from "@gitdojo/shared-types";
import { Badge, cn, Panel, PanelBody, PanelFooter, PanelHeader, PanelTitle } from "@gitdojo/ui";
import { BookOpen, Flag } from "lucide-react";
import { formatLessonNumber, type LessonNeighbors, LessonPager } from "@/features/course";
import { useLessonStore } from "../state/use-lesson-store";
import { CompletionCard } from "./CompletionCard";
import { LessonContent } from "./content/LessonContent";
import { HintPanel } from "./HintPanel";
import { ObjectiveList } from "./ObjectiveList";
import { renderInline, RichText } from "@/components/content/rich-text";

export interface LessonPanelProps {
  lesson: LessonDefinition;
  /** Where the lesson sits in its course, when it belongs to one. */
  course?: { slug: string; position: LessonNeighbors };
  onPracticeAgain: () => void;
  /** What completing this counts as in progress; defaults to the lesson itself. */
  content?: Pick<ContentRef, "kind" | "id">;
  /** Called when a hint is revealed: its objective and position (0 = first hint). */
  onHintRevealed?: (objectiveId: string, index: number) => void;
  className?: string;
}

export function LessonPanel({
  lesson,
  course,
  onPracticeAgain,
  content,
  onHintRevealed,
  className,
}: LessonPanelProps) {
  // Ignore progress left over from the previous lesson until this one has loaded.
  const progress = useLessonStore((state) =>
    state.progress?.lessonId === lesson.id ? state.progress : null,
  );
  const hintStates = useLessonStore((state) => state.hintStates);
  const revealHint = useLessonStore((state) => state.revealHint);
  const commandCount = useLessonStore((state) => state.commandCount);
  const validation = useLessonStore((state) =>
    state.validation?.lessonId === lesson.id ? state.validation : null,
  );

  const currentId = progress?.currentObjectiveId ?? lesson.objectives[0]?.id ?? null;
  const challenge = lessonTypeOf(lesson) === "challenge";
  const hints = currentId ? normalizeHints(lesson.hints?.[currentId], { challenge }) : [];
  // What the current objective's validator says is missing, once the learner has started.
  const missing =
    commandCount > 0 && currentId
      ? (validation?.objectives.find((o) => o.objectiveId === currentId && !o.passed)?.reason ??
        null)
      : null;

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
          {challenge && lesson.description ? (
            <div className="mt-4">
              <h2 className="text-micro font-semibold tracking-wider text-fg-muted uppercase">
                Scenario
              </h2>
              <RichText text={lesson.description} className="mt-1 text-small text-fg-secondary" />
            </div>
          ) : null}
          {lesson.goal ? (
            <div className="mt-4">
              <h2 className="text-micro font-semibold tracking-wider text-fg-muted uppercase">
                {challenge ? "Mission" : "Goal"}
              </h2>
              <p className="mt-1 text-body text-fg">{renderInline(lesson.goal)}</p>
            </div>
          ) : null}
          {!challenge && lesson.description ? (
            <RichText text={lesson.description} className="mt-4 text-small text-fg-secondary" />
          ) : null}
        </div>

        <ObjectiveList
          objectives={lesson.objectives}
          completedIds={progress?.completedObjectiveIds ?? []}
          currentId={progress?.completed ? null : currentId}
        />

        {progress?.completed ? (
          <CompletionCard
            lesson={lesson}
            content={content ?? { kind: "lesson", id: lesson.id }}
            onPracticeAgain={onPracticeAgain}
          />
        ) : currentId ? (
          <HintPanel
            key={currentId}
            hints={hints}
            state={hintStates[currentId]}
            missing={missing}
            onReveal={() => {
              const index = hintStates[currentId]?.revealedHints ?? 0;
              if (index >= hints.length) return;
              revealHint(currentId, hints.length);
              onHintRevealed?.(currentId, index);
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
