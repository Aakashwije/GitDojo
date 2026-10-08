"use client";

import { Button } from "@gitdojo/ui";
import { CircleCheck, FolderOpen } from "lucide-react";
import { useRepositoryStore } from "../state/use-repository-store";
import { EmptyState } from "./EmptyState";
import { FileAreaPanel } from "./FileAreaPanel";
import { FileRow } from "./FileRow";

const UNSTAGED_STATUSES = new Set(["conflicted", "untracked", "modified", "deleted"]);

export interface WorkingTreePanelProps {
  className?: string;
  /** Opens a changed file; without it, rows are not clickable. Wired by the workspace. */
  onOpenFile?: (path: string) => void;
  /** Starts resolving a conflicted file; without it, no "Resolve" action is offered. */
  onResolveConflict?: (path: string) => void;
}

/**
 * Files changed in the working tree. The panel only reads repository state: what opening a file
 * or resolving a conflict does is passed in, so the repository feature never depends on the
 * editor or conflict features.
 */
export function WorkingTreePanel({
  className,
  onOpenFile,
  onResolveConflict,
}: WorkingTreePanelProps) {
  const repository = useRepositoryStore((state) => state.repositoryState);
  const changed = repository.files.filter((file) => UNSTAGED_STATUSES.has(file.status));

  return (
    <FileAreaPanel
      title="Working Tree"
      description={repository.initialized ? "Files changed locally" : "Not a Git repository yet"}
      icon={FolderOpen}
      count={changed.length}
      testId="working-tree-panel"
      className={className}
    >
      {changed.length === 0 ? (
        <EmptyState icon={CircleCheck} title="No unstaged changes">
          Your working tree matches the staging area.
        </EmptyState>
      ) : (
        <ul aria-label="Changed files">
          {changed.map((file) => (
            <FileRow
              key={`${file.path}:${file.status}`}
              file={file}
              animation="enter"
              onOpen={file.status === "deleted" ? undefined : onOpenFile}
              action={
                file.status === "conflicted" && onResolveConflict ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-danger"
                    onClick={() => {
                      onResolveConflict(file.path);
                    }}
                  >
                    Resolve
                  </Button>
                ) : undefined
              }
            />
          ))}
        </ul>
      )}
    </FileAreaPanel>
  );
}
