"use client";

import { lessonTypeOf, type CourseOutline, type LessonDefinition } from "@gitdojo/shared-types";
import { cn } from "@gitdojo/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { courseHref, lessonHref, lessonNeighbors } from "@/features/course";
import { ConflictBanner, ConflictEditorDialog, useConflictEditorStore } from "@/features/conflicts";
import { type ChallengeContext, challengeHref } from "@/features/challenges";
import { useEditorStore, type WorkspaceFileActions } from "@/features/editor";
import { ErrorExplanation } from "@/features/errors";
import { LessonCompleteDialog, LessonPanel, useLessonStore } from "@/features/lesson";
import { useLessonProgress } from "@/features/progress";
import { RepositoryGraphPanel } from "@/features/repository";
import { createTerminalExecutor, type TerminalHandle } from "@/features/terminal";
import { useLearningSession } from "../hooks/use-learning-session";
import { LESSON_TABS, MobileTabs, type WorkspaceTab } from "./MobileTabs";
import { WorkspaceError } from "./WorkspaceError";
import { WorkspaceFilePanels } from "./WorkspaceFilePanels";
import { WorkbenchPanel } from "./WorkbenchPanel";
import { WorkspaceTopbar } from "./WorkspaceTopbar";

const BANNER =
  "\x1b[38;2;124;133;147mWelcome to GitDojo. This terminal runs Git in a safe sandbox.\r\nType \x1b[38;2;244;247;251mhelp\x1b[38;2;124;133;147m to see available commands.\x1b[39m";

export interface LessonWorkspaceProps {
  lesson: LessonDefinition;
  /** The course this lesson belongs to; the standalone demo and challenges have none. */
  course?: CourseOutline;
  /** Set when this workspace runs a challenge from /challenges. */
  challenge?: ChallengeContext;
}

/** Hands-on lessons and challenges: lesson panel, terminal, graph and file panels. */
export function LessonWorkspace({ lesson, course, challenge }: LessonWorkspaceProps) {
  const {
    status,
    errorDetails,
    execute,
    readFile,
    saveFile,
    createFile,
    deleteFile,
    reset,
    retry,
  } = useLearningSession(lesson, {
    // Challenges get their own workspaces, so their ids never clash with lessons'.
    workspaceId: challenge ? `challenge-${lesson.id}` : undefined,
  });
  const terminalRef = useRef<TerminalHandle>(null);
  const [tab, setTab] = useState<WorkspaceTab>("lesson");
  const executor = useMemo(() => createTerminalExecutor(execute), [execute]);
  const files = useMemo<WorkspaceFileActions>(
    () => ({ readFile, saveFile, createFile, deleteFile }),
    [readFile, saveFile, createFile, deleteFile],
  );

  // Each lesson starts with no files open.
  useEffect(() => {
    useEditorStore.getState().reset();
  }, [lesson.id]);

  const evaluatedComplete = useLessonStore(
    (state) => state.progress?.lessonId === lesson.id && state.progress.completed,
  );
  // Only this workspace's own evaluation counts. Until its session is ready, the store can still
  // hold the previous attempt, and a lesson and a challenge may share an id (`first-commit`).
  const completed = status === "ready" && evaluatedComplete;
  const completionDismissed = useLessonStore((state) => state.completionDismissed);
  const dismissCompletion = useLessonStore((state) => state.dismissCompletion);
  const { content, recordHint } = useLessonProgress({
    lesson,
    ...(course ? { courseId: course.id } : {}),
    challenge: challenge !== undefined,
    completed,
  });

  const position = course ? lessonNeighbors(course, lesson.slug) : null;
  const courseContext = course && position ? { slug: course.slug, position } : undefined;
  const next = challenge
    ? challenge.next
      ? { href: challengeHref(challenge.next.id), label: `Next: ${challenge.next.title}` }
      : { href: "/challenges", label: "All challenges" }
    : course && position
      ? position.next
        ? {
            href: lessonHref(course.slug, position.next.slug),
            label: `Next: ${position.next.title}`,
          }
        : { href: courseHref(course.slug), label: "Back to course" }
      : undefined;

  // Phones show one panel at a time: the lesson panel can send the learner to the terminal.
  const goToTerminal = useCallback(() => {
    useEditorStore.getState().setView("terminal");
    setTab("terminal");
  }, []);

  const resetLesson = useCallback(async () => {
    useConflictEditorStore.getState().close();
    useEditorStore.getState().reset();
    await reset();
    terminalRef.current?.restart();
  }, [reset]);

  // On phones only the active tab is shown; the terminal stays mounted to keep its session.
  const visibleOn = (panel: WorkspaceTab) => (tab === panel ? "" : "max-md:hidden");

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <WorkspaceTopbar
        lesson={lesson}
        course={course}
        challenge={challenge}
        terminal={{ ready: status === "ready", onReset: resetLesson }}
      />

      {status === "error" ? null : <ConflictBanner />}
      {status === "error" ? (
        <WorkspaceError details={errorDetails} onRetry={retry} />
      ) : (
        <main
          className={cn(
            "grid flex-1 gap-3 p-3 max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)]",
            "md:grid-cols-2",
            "lg:min-h-0 lg:grid-cols-[26fr_44fr_30fr] lg:grid-rows-[minmax(0,1fr)_minmax(200px,32%)]",
          )}
        >
          <LessonPanel
            lesson={lesson}
            course={courseContext}
            onPracticeAgain={() => void resetLesson()}
            content={content}
            onHintRevealed={recordHint}
            onGoToTerminal={goToTerminal}
            className={cn(visibleOn("lesson"), "md:h-[480px] lg:h-auto")}
          />
          <WorkbenchPanel
            executor={executor}
            ready={status === "ready"}
            banner={BANNER}
            handleRef={terminalRef}
            files={files}
            readOnly={lesson.editor?.readOnly ?? false}
            terminalFooter={<ErrorExplanation spoilerFree={lessonTypeOf(lesson) === "challenge"} />}
            className={cn(visibleOn("terminal"), "h-[calc(100dvh-10rem)] md:h-[480px] lg:h-auto")}
          />
          <RepositoryGraphPanel
            className={cn(
              visibleOn("graph"),
              "h-[calc(100dvh-10rem)] md:col-span-2 md:h-[360px] lg:col-span-1 lg:h-auto",
            )}
          />
          <div
            className={cn(
              visibleOn("files"),
              "grid gap-3 md:col-span-2 md:grid-cols-3 lg:col-span-3 lg:min-h-0",
            )}
          >
            <WorkspaceFilePanels />
          </div>
        </main>
      )}

      <ConflictEditorDialog readFile={readFile} saveFile={saveFile} />
      <MobileTabs active={tab} onChange={setTab} tabs={LESSON_TABS} />
      <LessonCompleteDialog
        lesson={lesson}
        content={content}
        open={completed && !completionDismissed}
        onOpenChange={(open) => {
          if (!open) dismissCompletion();
        }}
        onPracticeAgain={() => void resetLesson()}
        next={next}
        title={challenge ? "Challenge Solved" : undefined}
      />
    </div>
  );
}
