"use client";

import { cn, Panel, PanelDescription, PanelHeader, PanelTitle } from "@gitdojo/ui";
import { FileCode } from "lucide-react";
import { type WorkspaceFileActions } from "../services/editor-controller";
import { EditorView } from "./EditorView";

/** The editor as a standalone panel, for layouts with room for it next to the terminal. */
export function EditorPanel({
  files,
  readOnly,
  className,
}: {
  files: WorkspaceFileActions;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <Panel aria-label="Editor" className={cn("border-border-subtle", className)}>
      <PanelHeader className="bg-panel">
        <div className="min-w-0">
          <PanelTitle>
            <FileCode aria-hidden="true" />
            Editor
          </PanelTitle>
          <PanelDescription className="truncate">
            Edits are saved to the working tree automatically
          </PanelDescription>
        </div>
      </PanelHeader>
      <EditorView files={files} readOnly={readOnly} className="flex-1" />
    </Panel>
  );
}
