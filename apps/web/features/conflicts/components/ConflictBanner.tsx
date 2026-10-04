"use client";

import { type MergeState } from "@gitdojo/shared-types";
import { Button, cn } from "@gitdojo/ui";
import { CircleCheck, FileWarning, TriangleAlert } from "lucide-react";
import { useRepositoryStore } from "@/features/repository/state/use-repository-store";
import { useConflictEditorStore } from "../state/use-conflict-editor-store";

const FINISH: Record<MergeState["kind"], string> = {
  merge: "git commit",
  revert: "git revert --continue",
  "cherry-pick": "git cherry-pick --continue",
  rebase: "git rebase --continue",
};

/** What is happening, in a few words: "Merging feature into main", "Reverting abc1234 (...)"... */
function describeOperation(merge: MergeState, branch: string | null) {
  const target = <span className="font-mono text-fg">{branch ?? "HEAD"}</span>;
  const incoming = <span className="font-mono text-fg">{merge.branch}</span>;
  switch (merge.kind) {
    case "merge":
      return (
        <>
          Merging {incoming} into {target}.
        </>
      );
    case "revert":
      return <>Reverting {incoming}.</>;
    case "cherry-pick":
      return (
        <>
          Cherry-picking {incoming} onto {target}.
        </>
      );
    case "rebase":
      return (
        <>
          Rebasing <span className="font-mono text-fg">{merge.rebase?.branch ?? "HEAD"}</span>:
          replaying {incoming}.
        </>
      );
  }
}

/**
 * Shown while a merge (or a revert, cherry-pick or rebase step) is stopped for conflicts. Unresolved conflicts get a clear danger state with a button
 * per file; once every conflict is resolved it turns into a reminder to commit.
 */
export function ConflictBanner({ className }: { className?: string }) {
  const merge = useRepositoryStore((state) => state.repositoryState.merge);
  const conflicts = useRepositoryStore((state) => state.repositoryState.conflicts);
  const branch = useRepositoryStore((state) => state.repositoryState.currentBranch);
  const open = useConflictEditorStore((state) => state.open);
  if (merge === null || conflicts.length === 0) return null;

  const unresolved = conflicts.filter((conflict) => !conflict.resolved);
  const done = unresolved.length === 0;

  return (
    <section
      role={done ? "status" : "alert"}
      aria-label={done ? "Conflicts resolved" : "Conflict detected"}
      data-testid="conflict-banner"
      data-state={done ? "resolved" : "conflicted"}
      className={cn(
        "mx-3 mt-3 flex animate-gd-enter flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-2.5",
        done ? "border-success/30 bg-success-soft" : "border-danger/40 bg-danger-soft",
        className,
      )}
    >
      <p
        className={cn(
          "flex items-center gap-2 text-small font-semibold",
          done ? "text-success" : "text-danger",
        )}
      >
        {done ? (
          <CircleCheck className="size-4" aria-hidden="true" />
        ) : (
          <TriangleAlert className="size-4" aria-hidden="true" />
        )}
        {done ? "All conflicts resolved" : "Conflict detected"}
      </p>
      <p className="text-small text-fg-secondary">
        {done ? (
          <>
            Run <code className="gd-code">{FINISH[merge.kind]}</code> to finish.
          </>
        ) : (
          <>
            {describeOperation(merge, branch)} Edit{" "}
            {unresolved.length === 1 ? "this file" : "these files"}, then{" "}
            <code className="gd-code">git add</code> each one.
          </>
        )}
      </p>
      {done ? null : (
        <ul className="flex flex-wrap gap-2" aria-label="Conflicted files">
          {unresolved.map((conflict) => (
            <li key={conflict.path}>
              <Button
                size="sm"
                variant="danger"
                data-testid="open-conflict"
                data-path={conflict.path}
                onClick={() => {
                  open(conflict.path);
                }}
              >
                <FileWarning />
                <span className="font-mono">{conflict.path}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
