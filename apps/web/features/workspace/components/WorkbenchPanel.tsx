"use client";

import { cn, Panel, PanelHeader } from "@gitdojo/ui";
import { FileCode, SquareTerminal, type LucideIcon } from "lucide-react";
import { useEffect, type ReactNode, type RefObject } from "react";
import {
  EditorView,
  isDirty,
  useEditorStore,
  type WorkbenchView,
  type WorkspaceFileActions,
} from "@/features/editor";
import {
  Terminal,
  TerminalActions,
  type TerminalExecutor,
  type TerminalHandle,
} from "@/features/terminal";

export interface WorkbenchPanelProps {
  executor: TerminalExecutor;
  ready: boolean;
  banner?: string;
  handleRef: RefObject<TerminalHandle | null>;
  files: WorkspaceFileActions;
  readOnly?: boolean;
  /** Shown under the terminal, e.g. the error explanation panel. */
  terminalFooter?: ReactNode;
  className?: string;
}

const VIEWS: { id: WorkbenchView; label: string; icon: LucideIcon }[] = [
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
  { id: "editor", label: "Editor", icon: FileCode },
];

/**
 * The lesson workspace's centre panel: the terminal and the code editor share it as tabs. The
 * terminal stays mounted while hidden, so its session and history survive switching.
 */
export function WorkbenchPanel({
  executor,
  ready,
  banner,
  handleRef,
  files,
  readOnly,
  terminalFooter,
  className,
}: WorkbenchPanelProps) {
  const view = useEditorStore((state) => state.view);
  const setView = useEditorStore((state) => state.setView);
  const unsaved = useEditorStore((state) => state.tabs.some(isDirty));

  useEffect(() => {
    if (view === "terminal" && ready) handleRef.current?.focus();
  }, [view, ready, handleRef]);

  return (
    <Panel aria-label="Workbench" className={cn("border-border-subtle", className)}>
      <PanelHeader className="bg-panel py-0 pl-1">
        <div role="tablist" aria-label="Workbench" className="flex self-stretch">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`workbench-tab-${id}`}
              aria-selected={view === id}
              aria-controls={`workbench-${id}`}
              data-testid={`workbench-tab-${id}`}
              onClick={() => {
                setView(id);
              }}
              className={cn(
                "flex items-center gap-2 px-3 text-small font-semibold transition-colors",
                view === id
                  ? "text-fg shadow-[inset_0_-2px_0_var(--accent-primary)]"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
              {id === "editor" && unsaved ? (
                <span aria-label="unsaved changes" className="size-1.5 rounded-full bg-warning" />
              ) : null}
            </button>
          ))}
        </div>
        {view === "terminal" ? <TerminalActions handleRef={handleRef} /> : null}
      </PanelHeader>
      <div
        id="workbench-terminal"
        role="tabpanel"
        aria-labelledby="workbench-tab-terminal"
        className={cn("min-h-0 flex-1 flex-col", view === "terminal" ? "flex" : "hidden")}
      >
        <div className="min-h-0 flex-1">
          <Terminal executor={executor} ready={ready} banner={banner} handleRef={handleRef} />
        </div>
        {terminalFooter}
      </div>
      <div
        id="workbench-editor"
        role="tabpanel"
        aria-labelledby="workbench-tab-editor"
        className={cn("min-h-0 flex-1", view === "editor" ? "flex" : "hidden")}
      >
        {/* Mounted only when shown: Monaco loads on first use. */}
        {view === "editor" ? (
          <EditorView files={files} readOnly={readOnly} className="flex-1" />
        ) : null}
      </div>
    </Panel>
  );
}
