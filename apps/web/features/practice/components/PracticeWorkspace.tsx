"use client";

import { pickSurpriseTask } from "@gitdojo/progress";
import { type LessonDefinition, type PracticeTaskSummary } from "@gitdojo/shared-types";
import { cn } from "@gitdojo/ui";
import { ArrowLeft, GitCommitHorizontal, Layers, SquareTerminal, Target } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoMark } from "@/components/site/logo";
import { AccountControls } from "@/features/auth";
import { ConflictBanner, ConflictEditorDialog, useConflictEditorStore } from "@/features/conflicts";
import { useEditorStore } from "@/features/editor";
import { ErrorExplanation } from "@/features/errors";
import { recordCompletion, useSolvedPractice } from "@/features/progress";
import { RepositoryGraphPanel } from "@/features/repository";
import { createTerminalExecutor, terminalBanner, type TerminalHandle } from "@/features/terminal";
import { ThemeToggle } from "@/features/theme";
import {
  GitEditorDialog,
  HelpDialog,
  type MobileTab,
  MobileTabs,
  ResetLessonButton,
  usePracticeSession,
  WorkbenchPanel,
  WorkspaceError,
  WorkspaceFilePanels,
} from "@/features/workspace";
import { practiceHref } from "../services/practice-navigation";
import { PracticePanel } from "./PracticePanel";

const BANNER = terminalBanner(
  [
    "Practice mode: no steps, no hints. Reach the mission's end state.",
    "Type help to see available commands.",
  ],
  "help",
);

type PracticeTab = "task" | "terminal" | "graph" | "files";

const TABS: MobileTab<PracticeTab>[] = [
  { id: "task", label: "Task", icon: Target },
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
  { id: "graph", label: "Graph", icon: GitCommitHorizontal },
  { id: "files", label: "Files", icon: Layers },
];

export interface PracticeWorkspaceProps {
  lesson: LessonDefinition;
  task: PracticeTaskSummary;
  scenario: string;
  /** Every task, for "Another task". */
  tasks: PracticeTaskSummary[];
  related: { href: string; title: string } | null;
}

/** One practice task: the task panel, terminal and editor, graph and Git's three areas. */
export function PracticeWorkspace({
  lesson,
  task,
  scenario,
  tasks,
  related,
}: PracticeWorkspaceProps) {
  const { status, errorDetails, snapshot, execute, files, reset, retry } =
    usePracticeSession(lesson);
  const terminalRef = useRef<TerminalHandle>(null);
  const executor = useMemo(() => createTerminalExecutor(execute), [execute]);
  const [tab, setTab] = useState<PracticeTab>("task");
  const ready = status === "ready";
  const solved = ready && snapshot?.solved === true;
  const { solved: solvedTasks } = useSolvedPractice();

  // Each task starts with no files open.
  useEffect(() => {
    useEditorStore.getState().reset();
  }, [task.id]);

  // Recorded once per attempt, the moment this workspace's own evaluation says so.
  const recorded = useRef(false);
  useEffect(() => {
    if (!solved || recorded.current) return;
    recorded.current = true;
    void recordCompletion({ kind: "practice", id: task.id });
  }, [solved, task.id]);

  const startOver = useCallback(async () => {
    useConflictEditorStore.getState().close();
    useEditorStore.getState().reset();
    recorded.current = false;
    await reset();
    terminalRef.current?.restart();
  }, [reset]);

  // Stable for this task and progress: the same suggestion until something changes.
  const another = useMemo(() => {
    const pick = pickSurpriseTask(tasks, {
      solved: solvedTasks,
      current: task.id,
      seed: Object.keys(solvedTasks).length,
    });
    return pick && pick.id !== task.id ? { href: practiceHref(pick.id), title: pick.title } : null;
  }, [tasks, solvedTasks, task.id]);

  const visibleOn = (panel: PracticeTab) => (tab === panel ? "" : "max-md:hidden");

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-app px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            href="/"
            aria-label="GitDojo home"
            className="shrink-0 rounded-md p-1 text-fg transition-colors hover:bg-hover"
          >
            <LogoMark />
          </Link>
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
          <Link
            href="/practice"
            className="flex items-center gap-1 rounded-md px-1 text-caption text-fg-muted hover:text-fg"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Practice
          </Link>
          <p className="truncate text-small font-semibold text-fg" data-testid="practice-title">
            {task.title}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <HelpDialog />
          <ResetLessonButton confirm={false} disabled={!ready} onReset={startOver} />
          <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />
          <ThemeToggle />
          <AccountControls compact />
        </div>
      </header>

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
          <PracticePanel
            task={task}
            scenario={scenario}
            validation={ready ? (snapshot?.validation ?? null) : null}
            solved={solved}
            related={related}
            another={another}
            onRetry={() => void startOver()}
            className={cn(visibleOn("task"), "md:h-[480px] lg:h-auto")}
          />
          <WorkbenchPanel
            executor={executor}
            ready={ready}
            banner={BANNER}
            handleRef={terminalRef}
            files={files}
            terminalFooter={<ErrorExplanation spoilerFree />}
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

      <ConflictEditorDialog readFile={files.readFile} saveFile={files.saveFile} />
      <GitEditorDialog />
      <MobileTabs active={tab} onChange={setTab} tabs={TABS} />
    </div>
  );
}
