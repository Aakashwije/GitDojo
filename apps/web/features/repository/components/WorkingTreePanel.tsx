"use client";

import { CircleCheck, FolderOpen } from "lucide-react";
import { useRepositoryStore } from "../state/use-repository-store";
import { EmptyState } from "./EmptyState";
import { FileAreaPanel } from "./FileAreaPanel";
import { FileRow } from "./FileRow";

const UNSTAGED_STATUSES = new Set(["untracked", "modified", "deleted"]);

export function WorkingTreePanel({ className }: { className?: string }) {
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
            <FileRow key={`${file.path}:${file.status}`} file={file} animation="enter" />
          ))}
        </ul>
      )}
    </FileAreaPanel>
  );
}
