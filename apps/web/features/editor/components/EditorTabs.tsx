"use client";

import { cn } from "@gitdojo/ui";
import { X } from "lucide-react";
import { type ExplorerFile } from "../services/file-status";
import { isDirty, type EditorTab } from "../state/use-editor-store";
import { FileStatusIndicator } from "./FileStatusIndicator";

export interface EditorTabsProps {
  tabs: EditorTab[];
  activePath: string | null;
  files: ReadonlyMap<string, ExplorerFile>;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function EditorTabs({ tabs, activePath, files, onSelect, onClose }: EditorTabsProps) {
  return (
    <div role="tablist" aria-label="Open files" className="flex min-w-0 flex-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        const dirty = isDirty(tab);
        return (
          <div
            key={tab.path}
            data-testid="editor-tab"
            data-path={tab.path}
            data-dirty={dirty}
            className={cn(
              "group flex h-9 shrink-0 items-center gap-1 border-r border-border-subtle pr-1 pl-3",
              active
                ? "bg-editor text-fg shadow-[inset_0_-2px_0_var(--accent-primary)]"
                : "text-fg-muted hover:bg-hover",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={tab.path}
              onClick={() => {
                onSelect(tab.path);
              }}
              onAuxClick={(event) => {
                if (event.button === 1) onClose(tab.path);
              }}
              className="flex items-center gap-1.5 font-mono text-caption"
            >
              <span className={cn(tab.status === "missing" && "line-through")}>
                {fileName(tab.path)}
              </span>
              <FileStatusIndicator indicator={files.get(tab.path)?.indicator ?? null} />
            </button>
            <button
              type="button"
              aria-label={dirty ? `Close ${tab.path} (unsaved changes)` : `Close ${tab.path}`}
              onClick={() => {
                onClose(tab.path);
              }}
              className="group/close flex size-5 items-center justify-center rounded-sm hover:bg-elevated"
            >
              {dirty ? (
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-fg-secondary group-hover/close:hidden"
                />
              ) : null}
              <X
                className={cn(
                  "size-3.5",
                  dirty ? "hidden group-hover/close:block" : "opacity-60 group-hover:opacity-100",
                )}
                aria-hidden="true"
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}
