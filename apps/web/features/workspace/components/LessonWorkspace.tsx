"use client";

import { type LessonDefinition } from "@gitdojo/shared-types";
import { cn } from "@gitdojo/ui";
import { useCallback, useMemo, useRef, useState } from "react";
import { LessonCompleteDialog } from "@/features/lesson/components/LessonCompleteDialog";
import { LessonPanel } from "@/features/lesson/components/LessonPanel";
import { useLessonStore } from "@/features/lesson/state/use-lesson-store";
import { RepositoryGraphPanel } from "@/features/repository/components/RepositoryGraphPanel";
import { RepositoryPanel } from "@/features/repository/components/RepositoryPanel";
import { StagingAreaPanel } from "@/features/repository/components/StagingAreaPanel";
import { WorkingTreePanel } from "@/features/repository/components/WorkingTreePanel";
import { TerminalPanel } from "@/features/terminal/components/TerminalPanel";
import { type TerminalHandle } from "@/features/terminal/hooks/use-terminal";
import { createTerminalExecutor } from "@/features/terminal/services/terminal-executor";
import { useLearningSession } from "../hooks/use-learning-session";
import { MobileTabs, type WorkspaceTab } from "./MobileTabs";
import { WorkspaceError } from "./WorkspaceError";
import { WorkspaceTopbar } from "./WorkspaceTopbar";

const BANNER =
  "\x1b[38;2;124;133;147mWelcome to GitDojo. This terminal runs Git in a safe sandbox.\r\nType \x1b[38;2;244;247;251mhelp\x1b[38;2;124;133;147m to see available commands.\x1b[39m";

export function LessonWorkspace({ lesson }: { lesson: LessonDefinition }) {
  const { status, errorDetails, execute, reset, retry } = useLearningSession(lesson);
  const terminalRef = useRef<TerminalHandle>(null);
  const [tab, setTab] = useState<WorkspaceTab>("lesson");
  const executor = useMemo(() => createTerminalExecutor(execute), [execute]);

  const completed = useLessonStore((state) => state.progress?.completed ?? false);
  const completionDismissed = useLessonStore((state) => state.completionDismissed);
  const dismissCompletion = useLessonStore((state) => state.dismissCompletion);

  const resetLesson = useCallback(async () => {
    await reset();
    terminalRef.current?.restart();
  }, [reset]);

  // On phones only the active tab is shown; the terminal stays mounted to keep its session.
  const visibleOn = (panel: WorkspaceTab) => (tab === panel ? "" : "max-md:hidden");

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <WorkspaceTopbar lesson={lesson} ready={status === "ready"} onReset={resetLesson} />

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
            onPracticeAgain={() => void resetLesson()}
            className={cn(visibleOn("lesson"), "md:h-[480px] lg:h-auto")}
          />
          <TerminalPanel
            executor={executor}
            ready={status === "ready"}
            banner={BANNER}
            handleRef={terminalRef}
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
            <WorkingTreePanel className="max-md:min-h-40 md:h-[240px] lg:h-auto" />
            <StagingAreaPanel className="max-md:min-h-40 md:h-[240px] lg:h-auto" />
            <RepositoryPanel className="max-md:min-h-40 md:h-[240px] lg:h-auto" />
          </div>
        </main>
      )}

      <MobileTabs active={tab} onChange={setTab} />
      <LessonCompleteDialog
        lesson={lesson}
        open={completed && !completionDismissed}
        onOpenChange={(open) => {
          if (!open) dismissCompletion();
        }}
        onPracticeAgain={() => void resetLesson()}
      />
    </div>
  );
}
