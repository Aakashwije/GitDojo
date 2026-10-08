"use client";

import { normalizeHints } from "@gitdojo/hints";
import { type ContentRef } from "@gitdojo/progress";
import { lessonTypeOf, type LessonDefinition } from "@gitdojo/shared-types";
import { Badge, cn, Panel, PanelBody, PanelFooter, PanelHeader, PanelTitle } from "@gitdojo/ui";
import { BookOpen, Flag, Target } from "lucide-react";
import { formatLessonNumber, type LessonNeighbors, LessonPager } from "@/features/course";
import { useLessonStore } from "../state/use-lesson-store";
import { CompletionCard } from "./CompletionCard";
import { LessonContent } from "./content/LessonContent";
import { CurrentObjective } from "./CurrentObjective";
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
  /** Phones show one panel at a time; lets the lesson send the learner to the terminal. */
  onGoToTerminal?: () => void;
  className?: string;
}

export function LessonPanel({
  lesson,
  course,
  onPracticeAgain,
  content,
  onHintRevealed,
  onGoToTerminal,
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
  const currentIndex = lesson.objectives.findIndex((objective) => objective.id === currentId);
  const current = currentIndex === -1 ? undefined : lesson.objectives[currentIndex];
  const done = progress?.completed ?? false;

  const goal = lesson.goal ? (
    <div key="goal" className="rounded-md border border-border-subtle bg-panel p-3">
      <h2 className="flex items-center gap-1.5 text-micro font-semibold tracking-wider text-fg-muted uppercase">
        <Target className="size-3.5 text-accent" aria-hidden="true" />
        {challenge ? "Mission" : "Goal"}
      </h2>
      <p className="mt-1.5 text-small text-fg">{renderInline(lesson.goal)}</p>
    </div>
  ) : null;
  const description = lesson.description ? (
    <div key="description">
      {challenge ? (
        <h2 className="text-micro font-semibold tracking-wider text-fg-muted uppercase">
          Scenario
        </h2>
      ) : null}
      <RichText
        text={lesson.description}
        className={cn("text-small text-fg-secondary", challenge && "mt-1")}
      />
    </div>
  ) : null;

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
      <PanelBody className="space-y-5">
        <header className="space-y-3">
          <h1 className="text-h3 font-semibold tracking-tight text-fg">{lesson.title}</h1>
          {/* A challenge's scenario sets up its mission, so it is read first. */}
          {challenge ? [description, goal] : [goal, description]}
        </header>

        {lesson.objectives.length > 0 ? (
          <div className="space-y-3 border-t border-border-subtle pt-5">
            <ObjectiveList
              objectives={lesson.objectives}
              completedIds={progress?.completedObjectiveIds ?? []}
              currentId={done ? null : currentId}
            />

            {done ? (
              <CompletionCard
                lesson={lesson}
                content={content ?? { kind: "lesson", id: lesson.id }}
                onPracticeAgain={onPracticeAgain}
              />
            ) : current ? (
              <CurrentObjective
                description={current.description}
                number={currentIndex + 1}
                total={lesson.objectives.length}
                {...(onGoToTerminal ? { onGoToTerminal } : {})}
              >
                <HintPanel
                  key={current.id}
                  hints={hints}
                  state={hintStates[current.id]}
                  missing={missing}
                  className="mt-3"
                  onReveal={() => {
                    const index = hintStates[current.id]?.revealedHints ?? 0;
                    if (index >= hints.length) return;
                    revealHint(current.id, hints.length);
                    onHintRevealed?.(current.id, index);
                  }}
                />
              </CurrentObjective>
            ) : null}
          </div>
        ) : null}

        {lesson.content && lesson.content.length > 0 ? (
          <section
            aria-labelledby="reference-heading"
            className="border-t border-border-subtle pt-5"
          >
            <h2
              id="reference-heading"
              className="mb-4 text-micro font-semibold tracking-wider text-fg-muted uppercase"
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
