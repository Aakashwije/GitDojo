"use client";

import { Badge, cn, IconButton, Tooltip } from "@gitdojo/ui";
import { CircleAlert, FileCode, Lock, PanelLeft } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRepositoryStore } from "@/features/repository";
import { EditorController, type WorkspaceFileActions } from "../services/editor-controller";
import { languageForPath, languageLabel } from "../services/file-language";
import { explorerFiles } from "../services/file-status";
import { isDirty, useEditorStore } from "../state/use-editor-store";
import { EditorTabs } from "./EditorTabs";
import { FileExplorer } from "./FileExplorer";

// Monaco touches `window` and measures the DOM, so it is loaded in the browser only.
const CodeEditor = dynamic(() => import("./CodeEditor").then((module) => module.CodeEditor), {
  ssr: false,
  loading: () => <p className="p-4 text-caption text-fg-muted">Loading editor…</p>,
});

export interface EditorViewProps {
  files: WorkspaceFileActions;
  readOnly?: boolean;
  /** Start with the explorer hidden, e.g. on narrow panels. */
  explorerCollapsed?: boolean;
  className?: string;
}

/**
 * File explorer, tabs and Monaco. Every save goes to the virtual filesystem, after which the
 * repository state is recomputed, so the Working Tree shows the file as modified.
 */
export function EditorView({
  files,
  readOnly = false,
  explorerCollapsed = false,
  className,
}: EditorViewProps) {
  const repository = useRepositoryStore((state) => state.repositoryState);
  const revision = useRepositoryStore((state) => state.revision);
  const workspaceId = useRepositoryStore((state) => state.workspaceId);
  const tabs = useEditorStore((state) => state.tabs);
  const activePath = useEditorStore((state) => state.activePath);
  const [showExplorer, setShowExplorer] = useState(!explorerCollapsed);

  const controller = useMemo(() => new EditorController(files), [files]);
  useEffect(
    () => () => {
      controller.dispose();
    },
    [controller],
  );
  // Newly opened tabs load their content; tabs opened elsewhere (e.g. the Working Tree) too.
  useEffect(() => {
    void controller.loadPending();
  }, [controller, tabs]);
  // A command may have changed open files (git restore, git switch, ...).
  useEffect(() => {
    void controller.refresh();
  }, [controller, revision]);

  const explorer = useMemo(() => explorerFiles(repository), [repository]);
  const byPath = useMemo(() => new Map(explorer.map((file) => [file.path, file])), [explorer]);
  const active = tabs.find((tab) => tab.path === activePath) ?? null;
  const language = active ? languageForPath(active.path) : "plaintext";

  const status = !active
    ? null
    : readOnly
      ? "Read-only"
      : active.saving
        ? "Saving…"
        : isDirty(active)
          ? "Unsaved changes"
          : active.status === "ready"
            ? "Saved"
            : null;

  return (
    <div className={cn("flex min-h-0 min-w-0", className)}>
      {showExplorer ? (
        <FileExplorer
          files={explorer}
          activePath={activePath}
          readOnly={readOnly}
          onOpen={(path) => {
            useEditorStore.getState().openFile(path);
          }}
          onCreate={(path) => controller.create(path)}
          onDelete={(path) => controller.remove(path)}
          className="w-48 shrink-0 border-r border-border-subtle bg-surface max-sm:w-40"
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col bg-editor">
        <div className="flex shrink-0 items-stretch border-b border-border-subtle bg-panel">
          <Tooltip content={showExplorer ? "Hide files" : "Show files"}>
            <IconButton
              aria-label={showExplorer ? "Hide file explorer" : "Show file explorer"}
              aria-pressed={showExplorer}
              className="m-0.5 size-8"
              onClick={() => {
                setShowExplorer((value) => !value);
              }}
            >
              <PanelLeft />
            </IconButton>
          </Tooltip>
          <EditorTabs
            tabs={tabs}
            activePath={activePath}
            files={byPath}
            onSelect={(path) => {
              useEditorStore.getState().setActive(path);
            }}
            onClose={(path) => void controller.close(path)}
          />
        </div>

        <div className="relative min-h-0 flex-1">
          {!active ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
              <FileCode className="size-5 text-fg-faint" aria-hidden="true" />
              <p className="text-small font-medium text-fg-secondary">No file open</p>
              <p className="max-w-72 text-caption text-fg-muted">
                Pick a file from the explorer. Edits are saved automatically and show up in the
                Working Tree, just like editing on your own machine.
              </p>
            </div>
          ) : active.status === "loading" ? (
            <p className="p-4 text-caption text-fg-muted">Opening {active.path}…</p>
          ) : active.status === "missing" ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
              <CircleAlert className="size-5 text-warning" aria-hidden="true" />
              <p className="text-small font-medium text-fg-secondary">
                {active.path} no longer exists
              </p>
              <p className="max-w-72 text-caption text-fg-muted">
                A command removed it from the working tree. It reopens here if it comes back.
              </p>
            </div>
          ) : active.status === "error" ? (
            <p role="alert" className="p-4 text-small text-danger">
              {active.error}
            </p>
          ) : (
            <CodeEditor
              modelPath={`${workspaceId ?? "workspace"}/${active.path}`}
              value={active.draft}
              language={language}
              readOnly={readOnly}
              label={`Editing ${active.path}`}
              onChange={(value) => {
                controller.change(active.path, value);
              }}
              onSave={() => void controller.save(active.path)}
              onBlur={() => void controller.flush()}
            />
          )}
        </div>

        {active ? (
          <footer className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-border-subtle bg-panel px-3 text-micro text-fg-muted">
            <span className="truncate font-mono">{active.path}</span>
            <span className="flex shrink-0 items-center gap-3">
              {active.error && active.status === "ready" ? (
                <span role="alert" className="text-danger">
                  Not saved: {active.error}
                </span>
              ) : null}
              <span>{languageLabel(language)}</span>
              {readOnly ? (
                <Badge tone="neutral">
                  <Lock aria-hidden="true" /> Read-only
                </Badge>
              ) : (
                <span data-testid="editor-save-status" aria-live="polite">
                  {status}
                </span>
              )}
            </span>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
