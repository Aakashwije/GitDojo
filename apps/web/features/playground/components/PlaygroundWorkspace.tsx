"use client";

import { type PlaygroundScenario } from "@gitdojo/shared-types";
import { Badge, Button, cn, Tooltip } from "@gitdojo/ui";
import {
  Download,
  FileCode,
  FolderPlus,
  GitCommitHorizontal,
  Layers,
  SquareTerminal,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoMark } from "@/components/site/logo";
import { AccountControls } from "@/features/auth/components/AccountControls";
import { ConflictBanner } from "@/features/conflicts/components/ConflictBanner";
import { ConflictEditorDialog } from "@/features/conflicts/components/ConflictEditorDialog";
import { useConflictEditorStore } from "@/features/conflicts/state/use-conflict-editor-store";
import { EditorPanel } from "@/features/editor/components/EditorPanel";
import { ErrorExplanation } from "@/features/errors/components/ErrorExplanation";
import { useEditorStore } from "@/features/editor/state/use-editor-store";
import { RepositoryGraphPanel } from "@/features/repository/components/RepositoryGraphPanel";
import { RepositoryPanel } from "@/features/repository/components/RepositoryPanel";
import { StagingAreaPanel } from "@/features/repository/components/StagingAreaPanel";
import { WorkingTreePanel } from "@/features/repository/components/WorkingTreePanel";
import { TerminalPanel } from "@/features/terminal/components/TerminalPanel";
import { type TerminalHandle } from "@/features/terminal/hooks/use-terminal";
import { createTerminalExecutor } from "@/features/terminal/services/terminal-executor";
import { HelpDialog } from "@/features/workspace/components/HelpDialog";
import { MobileTabs, type MobileTab } from "@/features/workspace/components/MobileTabs";
import { ResetLessonButton } from "@/features/workspace/components/ResetLessonDialog";
import { WorkspaceError } from "@/features/workspace/components/WorkspaceError";
import { usePlaygroundSession } from "../hooks/use-playground-session";
import { usePlaygroundStore } from "../state/use-playground-store";
import { ScenarioDialog } from "./ScenarioDialog";

const BANNER =
  "\x1b[38;2;124;133;147mWelcome to the playground. Try anything here.\r\nType \x1b[38;2;244;247;251mhelp\x1b[38;2;124;133;147m to see available commands.\x1b[39m";

type PlaygroundTab = "editor" | "terminal" | "graph" | "files";

const TABS: MobileTab<PlaygroundTab>[] = [
  { id: "editor", label: "Editor", icon: FileCode },
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
  { id: "graph", label: "Graph", icon: GitCommitHorizontal },
  { id: "files", label: "Files", icon: Layers },
];

function download(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Free experimentation: editor, terminal, graph and Git's three areas, with no lesson. */
export function PlaygroundWorkspace({ scenarios }: { scenarios: PlaygroundScenario[] }) {
  const playground = usePlaygroundSession(scenarios);
  const { status, execute, files } = playground;
  const terminalRef = useRef<TerminalHandle>(null);
  const executor = useMemo(() => createTerminalExecutor(execute), [execute]);
  const [tab, setTab] = useState<PlaygroundTab>("terminal");
  const scenarioId = usePlaygroundStore((state) => state.scenarioId);
  const scenario = scenarios.find((candidate) => candidate.id === scenarioId);
  const ready = status === "ready";

  // Replacing the repository also starts a fresh terminal session.
  const replaced = useCallback(async (replace: () => Promise<void>) => {
    useConflictEditorStore.getState().close();
    await replace();
    terminalRef.current?.restart();
  }, []);

  const exportSnapshot = async () => {
    const snapshot = await playground.exportSnapshot();
    const stamp = snapshot.exportedAt.slice(0, 19).replace(/[:T]/g, "-");
    download(`gitdojo-playground-${stamp}.json`, `${JSON.stringify(snapshot, null, 2)}\n`);
  };

  // On phones, opening a file (e.g. from the Working Tree) shows the editor.
  useEffect(
    () =>
      useEditorStore.subscribe((state, previous) => {
        if (state.activePath !== null && state.activePath !== previous.activePath) {
          setTab("editor");
        }
      }),
    [],
  );

  const visibleOn = (panel: PlaygroundTab) => (tab === panel ? "" : "max-md:hidden");

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
          <div className="min-w-0">
            <h1 className="text-caption font-normal text-fg-muted">Playground</h1>
            <p
              className="flex items-center gap-2 truncate text-small font-semibold text-fg"
              data-testid="playground-scenario"
            >
              {scenario?.title ?? "New repository"}
              {playground.restored ? (
                <Badge tone="neutral" className="max-sm:hidden">
                  Restored
                </Badge>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip content="A blank folder: start with git init">
            <Button
              variant="ghost"
              size="sm"
              disabled={!ready}
              onClick={() => void replaced(playground.newRepository)}
            >
              <FolderPlus /> <span className="max-lg:sr-only">New repository</span>
            </Button>
          </Tooltip>
          <ScenarioDialog
            scenarios={scenarios}
            currentId={scenarioId}
            disabled={!ready}
            onLoad={(next) => replaced(() => playground.loadScenario(next))}
          />
          <Tooltip content="Download the files and repository state as JSON">
            <Button
              variant="ghost"
              size="sm"
              disabled={!ready}
              data-testid="export-snapshot"
              onClick={() => void exportSnapshot()}
            >
              <Download /> <span className="max-lg:sr-only">Export</span>
            </Button>
          </Tooltip>
          <HelpDialog />
          <ResetLessonButton
            confirm
            disabled={!ready}
            onReset={() => replaced(playground.reset)}
            title="Reset the playground?"
            description={`The repository goes back to the start of "${scenario?.title ?? "New repository"}". Everything you changed is discarded.`}
            confirmLabel="Reset repository"
          />
          <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />
          <AccountControls compact />
        </div>
      </header>

      {status === "error" ? null : <ConflictBanner />}
      {status === "error" ? (
        <WorkspaceError details={playground.errorDetails} onRetry={playground.retry} />
      ) : (
        <main
          className={cn(
            "grid flex-1 gap-3 p-3 max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)]",
            "md:grid-cols-2",
            "lg:min-h-0 lg:grid-cols-[38fr_32fr_30fr] lg:grid-rows-[minmax(0,1fr)_minmax(200px,32%)]",
          )}
        >
          <EditorPanel
            files={files}
            className={cn(visibleOn("editor"), "h-[calc(100dvh-10rem)] md:h-[480px] lg:h-auto")}
          />
          <TerminalPanel
            executor={executor}
            ready={ready}
            banner={BANNER}
            handleRef={terminalRef}
            footer={<ErrorExplanation />}
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

      <ConflictEditorDialog readFile={files.readFile} saveFile={files.saveFile} />
      <MobileTabs active={tab} onChange={setTab} tabs={TABS} />
    </div>
  );
}
