import { type GitContext } from "../engine/context";
import { notARepository, success } from "../engine/errors";
import {
  type GitStatusData,
  type GitStatusEntry,
  type GitStatusResult,
} from "../engine/git-engine";
import { currentBranch, isRepository, resolveRefOrNull, shortOid } from "../engine/repository";
import { operationKind, readMergeState, unresolvedConflicts } from "../engine/merge-state";
import { readStatusEntries } from "../engine/status-matrix";
import { conflictKind } from "./merge";

export async function readStatusData(ctx: GitContext): Promise<GitStatusData> {
  const [branch, head, entries, merge] = await Promise.all([
    currentBranch(ctx),
    resolveRefOrNull(ctx, "HEAD"),
    readStatusEntries(ctx),
    readMergeState(ctx),
  ]);
  return {
    branch,
    head,
    hasCommits: head !== null,
    entries,
    merge: merge && {
      kind: operationKind(merge),
      commit: merge.theirs,
      unresolved: unresolvedConflicts(merge).map((conflict) => ({
        path: conflict.path,
        kind: conflictKind(conflict),
      })),
      ...(merge.rebase ? { rebase: { branch: merge.rebase.branch, onto: merge.rebase.onto } } : {}),
    },
  };
}

/** The lines Git prints under "On branch ..." while an operation is stopped for conflicts. */
function operationNotice(merge: NonNullable<GitStatusData["merge"]>): string[] {
  const done = merge.unresolved.length === 0;
  const short = shortOid(merge.commit);
  switch (merge.kind) {
    case "merge":
      return done
        ? [
            "All conflicts fixed but you are still merging.",
            '  (use "git commit" to conclude merge)',
          ]
        : [
            "You have unmerged paths.",
            '  (fix conflicts and run "git commit")',
            '  (use "git merge --abort" to abort the merge)',
          ];
    case "cherry-pick":
    case "revert": {
      const verb = merge.kind === "revert" ? "reverting" : "cherry-picking";
      return [
        `You are currently ${verb} commit ${short}.`,
        done
          ? `  (all conflicts fixed: run "git ${merge.kind} --continue")`
          : `  (fix conflicts and run "git ${merge.kind} --continue")`,
        `  (use "git ${merge.kind} --abort" to cancel the ${merge.kind === "revert" ? "revert" : "cherry-pick"} operation)`,
      ];
    }
    case "rebase": {
      const branch = merge.rebase?.branch ?? "HEAD";
      const onto = shortOid(merge.rebase?.onto ?? merge.commit);
      return [
        `You are currently rebasing branch '${branch}' on '${onto}'.`,
        done
          ? '  (all conflicts fixed: run "git rebase --continue")'
          : '  (fix conflicts and then run "git rebase --continue")',
        '  (use "git rebase --skip" to skip this patch)',
        '  (use "git rebase --abort" to check out the original branch)',
      ];
    }
  }
}

export async function runStatus(ctx: GitContext): Promise<GitStatusResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const data = await readStatusData(ctx);
  return success(formatStatus(data), data);
}

const STAGED_LABELS = { added: "new file", modified: "modified", deleted: "deleted" } as const;
const UNSTAGED_LABELS = { modified: "modified", deleted: "deleted" } as const;

function labelled(label: string, path: string): string {
  return `\t${`${label}:`.padEnd(12)}${path}`;
}

/** Renders long-format `git status` output, mirroring real Git's wording and hints. */
export function formatStatus({
  branch,
  head,
  hasCommits,
  entries: allEntries,
  merge,
}: GitStatusData): string {
  // Unresolved conflicts are listed only under "Unmerged paths".
  const unmerged = merge?.unresolved ?? [];
  const unmergedPaths = new Set(unmerged.map((conflict) => conflict.path));
  const entries = allEntries.filter((entry) => !unmergedPaths.has(entry.path));
  const staged = entries.filter((entry) => entry.staged !== null);
  const unstaged = entries.filter(
    (entry): entry is GitStatusEntry & { unstaged: "modified" | "deleted" } =>
      entry.unstaged === "modified" || entry.unstaged === "deleted",
  );
  const untracked = entries.filter((entry) => entry.unstaged === "untracked");

  const sections: string[] = [];
  if (!hasCommits) sections.push("No commits yet");
  // Git prints the operation notice directly under "On branch", not as a separate section.
  const mergeNotice = merge === null ? [] : operationNotice(merge);

  if (staged.length > 0) {
    const unstageHint = hasCommits
      ? '  (use "git restore --staged <file>..." to unstage)'
      : '  (use "git rm --cached <file>..." to unstage)';
    sections.push(
      [
        "Changes to be committed:",
        unstageHint,
        ...staged.map((entry) => labelled(STAGED_LABELS[entry.staged ?? "modified"], entry.path)),
      ].join("\n"),
    );
  }

  if (unmerged.length > 0) {
    sections.push(
      [
        "Unmerged paths:",
        '  (use "git add <file>..." to mark resolution)',
        ...unmerged.map((conflict) => `\t${`${conflict.kind}:`.padEnd(17)}${conflict.path}`),
      ].join("\n"),
    );
  }

  if (unstaged.length > 0) {
    sections.push(
      [
        "Changes not staged for commit:",
        '  (use "git add <file>..." to update what will be committed)',
        ...unstaged.map((entry) => labelled(UNSTAGED_LABELS[entry.unstaged], entry.path)),
      ].join("\n"),
    );
  }

  if (untracked.length > 0) {
    sections.push(
      [
        "Untracked files:",
        '  (use "git add <file>..." to include in what will be committed)',
        ...untracked.map((entry) => `\t${entry.path}`),
      ].join("\n"),
    );
  }

  const where =
    merge?.kind === "rebase"
      ? `rebase in progress; onto ${shortOid(merge.rebase?.onto ?? merge.commit)}`
      : branch === null && head !== null
        ? `HEAD detached at ${shortOid(head)}`
        : `On branch ${branch ?? "HEAD"}`;
  const header = [where, ...mergeNotice].join("\n");
  const summary =
    unmerged.length > 0 && staged.length === 0
      ? 'no changes added to commit (use "git add" and/or "git commit -a")'
      : merge && staged.length === 0 && unstaged.length === 0 && untracked.length === 0
        ? null
        : statusSummary(staged.length, unstaged.length, untracked.length, hasCommits);

  if (sections.length === 0) return `${header}\n${summary}`;
  const body = [header, ...sections].join("\n\n");
  return summary === null ? body : `${body}\n\n${summary}`;
}

function statusSummary(
  staged: number,
  unstaged: number,
  untracked: number,
  hasCommits: boolean,
): string | null {
  if (staged > 0) return null;
  if (unstaged > 0) return 'no changes added to commit (use "git add" to stage changes)';
  if (untracked > 0) {
    return 'nothing added to commit but untracked files present (use "git add" to track)';
  }
  return hasCommits
    ? "nothing to commit, working tree clean"
    : 'nothing to commit (create/copy files and use "git add" to track)';
}
