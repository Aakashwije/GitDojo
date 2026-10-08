"use client";

import { Inbox, Layers } from "lucide-react";
import { useRepositoryStore } from "../state/use-repository-store";
import { EmptyState } from "./EmptyState";
import { FileAreaPanel } from "./FileAreaPanel";
import { FileRow } from "./FileRow";

export interface StagingAreaPanelProps {
  className?: string;
  /** Opens a staged file; without it, rows are not clickable. Wired by the workspace. */
  onOpenFile?: (path: string) => void;
}

export function StagingAreaPanel({ className, onOpenFile }: StagingAreaPanelProps) {
  const staged = useRepositoryStore((state) => state.repositoryState.stagedFiles);

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
              onOpen={file.change === "deleted" ? undefined : onOpenFile}
            />
          ))}
        </ul>
      )}
    </FileAreaPanel>
  );
}
