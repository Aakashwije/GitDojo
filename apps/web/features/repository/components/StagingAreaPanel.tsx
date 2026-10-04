"use client";

import { Inbox, Layers } from "lucide-react";
import { useEditorStore } from "@/features/editor/state/use-editor-store";
import { useRepositoryStore } from "../state/use-repository-store";
import { EmptyState } from "./EmptyState";
import { FileAreaPanel } from "./FileAreaPanel";
import { FileRow } from "./FileRow";

export function StagingAreaPanel({ className }: { className?: string }) {
  const staged = useRepositoryStore((state) => state.repositoryState.stagedFiles);
  const openFile = useEditorStore((state) => state.openFile);

  return (
    <FileAreaPanel
      title="Staging Area"
      description="Files prepared for the next commit"
      icon={Layers}
      count={staged.length}
      testId="staging-area-panel"
      className={className}
    >
      {staged.length === 0 ? (
        <EmptyState icon={Inbox} title="No staged changes">
          Use <code className="gd-code">git add</code> to prepare files for your next commit.
        </EmptyState>
      ) : (
        <ul aria-label="Staged files">
          {staged.map((file) => (
            <FileRow
              key={`${file.path}:${file.change ?? ""}`}
              file={file}
              animation="move-in"
              onOpen={file.change === "deleted" ? undefined : openFile}
            />
          ))}
        </ul>
      )}
    </FileAreaPanel>
  );
}
