"use client";

import { cn } from "@gitdojo/ui";
import { type RepositoryState } from "@gitdojo/shared-types";
import { Archive, Cloud, Database, GitCommitHorizontal, Tag } from "lucide-react";
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
          {repository.stashes.length > 0 ? (
            <section
              aria-label="Stash"
              data-testid="stash-list"
              className="border-t border-border-subtle pt-2"
            >
              <h3 className="flex items-center gap-1.5 px-2 text-micro font-semibold tracking-wider text-fg-muted uppercase">
                <Archive className="size-3.5" aria-hidden="true" /> Stash
              </h3>
              <ol className="mt-1">
                {repository.stashes.map((stash) => (
                  <li
                    key={stash.oid}
                    className="flex animate-gd-enter items-baseline gap-2 px-2 py-1"
                    title={stash.files.join(", ")}
                  >
                    <span className="shrink-0 font-mono text-caption text-accent">
                      {stash.selector}
                    </span>
                    <span className="truncate text-small text-fg-secondary">{stash.message}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <TagList tags={repository.tags} />
          <RemoteList repository={repository} />
        </div>
      )}
    </FileAreaPanel>
  );
}

const SECTION_HEADING =
  "flex items-center gap-1.5 px-2 text-micro font-semibold tracking-wider text-fg-muted uppercase";

function TagList({ tags }: { tags: RepositoryState["tags"] }) {
  if (tags.length === 0) return null;
  return (
    <section
      aria-label="Tags"
      data-testid="tag-list"
      className="border-t border-border-subtle pt-2"
    >
      <h3 className={SECTION_HEADING}>
        <Tag className="size-3.5" aria-hidden="true" /> Tags
      </h3>
      <ul className="mt-1">
        {tags.map((tag) => (
          <li key={tag.name} className="flex animate-gd-enter items-baseline gap-2 px-2 py-1">
            <span className="shrink-0 font-mono text-caption text-warning">{tag.name}</span>
            <span className="font-mono text-caption text-fg-muted">{tag.oid.slice(0, 7)}</span>
            <span className="truncate text-small text-fg-secondary">
              {tag.annotated ? (tag.message ?? "annotated") : "lightweight"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The simulated remote's branches next to this repository's record of them (`origin/main`).
 * A real repository cannot see the server without fetching; GitDojo shows it, labelled, so the
 * learner can see what a fetch or a push is about to move.
 */
function RemoteList({ repository }: { repository: RepositoryState }) {
  if (repository.remotes.length === 0) return null;
  return (
    <section
      aria-label="Simulated remotes"
      data-testid="remote-list"
      className="border-t border-border-subtle pt-2"
    >
      <h3 className={SECTION_HEADING}>
        <Cloud className="size-3.5" aria-hidden="true" /> Simulated remote
      </h3>
      {repository.remotes.map((remote) => (
        <div key={remote.name} className="mt-1 px-2">
          <p className="truncate font-mono text-caption text-fg-secondary" title={remote.url}>
            {remote.name} · {remote.url}
          </p>
          <ul className="mt-0.5">
            {remote.branches.map((branch) => {
              const ref = `${remote.name}/${branch.name}`;
              const tracking = repository.remoteBranches.find(
                (candidate) => candidate.name === ref,
              );
              const state =
                tracking === undefined
                  ? "not fetched yet"
                  : tracking.oid === branch.oid
                    ? `${ref} is up to date`
                    : `${ref} is out of date: fetch to update it`;
              return (
                <li
                  key={branch.name}
                  className="flex items-baseline gap-2 py-0.5"
                  data-testid="remote-branch"
                  data-branch={branch.name}
                >
                  <span className="shrink-0 font-mono text-caption text-branch">{branch.name}</span>
                  <span className="font-mono text-caption text-fg-muted">
                    {branch.oid.slice(0, 7)}
                  </span>
                  <span className="truncate text-caption text-fg-muted">{state}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
