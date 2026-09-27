import { type GitContext } from "../engine/context";
import { notARepository, success } from "../engine/errors";
import {
  type GitStatusData,
  type GitStatusEntry,
  type GitStatusResult,
} from "../engine/git-engine";
import { currentBranch, isRepository, resolveRefOrNull } from "../engine/repository";
import { readStatusEntries } from "../engine/status-matrix";

export async function readStatusData(ctx: GitContext): Promise<GitStatusData> {
  const [branch, head, entries] = await Promise.all([
    currentBranch(ctx),
    resolveRefOrNull(ctx, "HEAD"),
    readStatusEntries(ctx),
  ]);
  return { branch, hasCommits: head !== null, entries };
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
export function formatStatus({ branch, hasCommits, entries }: GitStatusData): string {
  const staged = entries.filter((entry) => entry.staged !== null);
  const unstaged = entries.filter(
    (entry): entry is GitStatusEntry & { unstaged: "modified" | "deleted" } =>
      entry.unstaged === "modified" || entry.unstaged === "deleted",
  );
  const untracked = entries.filter((entry) => entry.unstaged === "untracked");

  const sections: string[] = [];
  if (!hasCommits) sections.push("No commits yet");

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

  const header = `On branch ${branch ?? "HEAD"}`;
  const summary = statusSummary(staged.length, unstaged.length, untracked.length, hasCommits);

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
