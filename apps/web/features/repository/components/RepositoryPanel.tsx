"use client";

import { cn } from "@gitdojo/ui";
import { Database, GitCommitHorizontal } from "lucide-react";
import { useRepositoryStore } from "../state/use-repository-store";
import { EmptyState } from "./EmptyState";
import { FileAreaPanel } from "./FileAreaPanel";

const MAX_COMMITS = 5;

export function RepositoryPanel({ className }: { className?: string }) {
  const repository = useRepositoryStore((state) => state.repositoryState);
  const selectCommit = useRepositoryStore((state) => state.selectCommit);
  const tracked = repository.files.filter((file) => file.status !== "untracked").length;

  return (
    <FileAreaPanel
      title="Repository"
      description="Committed history"
      icon={Database}
      count={repository.commits.length}
      testId="repository-panel"
      className={className}
    >
      {repository.commits.length === 0 ? (
        <EmptyState icon={GitCommitHorizontal} title="No commits yet">
          Use <code className="gd-code">git commit</code> to record staged changes.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          <ol aria-label="Recent commits">
            {repository.commits.slice(0, MAX_COMMITS).map((commit) => (
              <li key={commit.oid} className="animate-gd-move-in">
                <button
                  type="button"
                  onClick={() => {
                    selectCommit(commit.oid);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      commit.oid === repository.head ? "bg-accent" : "bg-fg-muted",
                    )}
                  />
                  <span className="font-mono text-caption text-warning">{commit.shortOid}</span>
                  <span className="truncate text-small text-fg">{commit.message}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="px-2 text-caption text-fg-muted">
            {tracked} tracked file{tracked === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </FileAreaPanel>
  );
}
