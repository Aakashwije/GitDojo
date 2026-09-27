import { type StagedChange } from "@gitdojo/shared-types";
import git from "isomorphic-git";
import { type GitContext } from "./context";
import { type GitStatusEntry, type UnstagedChange } from "./git-engine";

/** isomorphic-git status matrix row: [path, HEAD, WORKDIR, STAGE]. */
export type StatusRow = [string, 0 | 1, 0 | 1 | 2, 0 | 1 | 2 | 3];

/**
 * Translates isomorphic-git's numeric status codes into staged/unstaged changes.
 *
 * HEAD:    0 absent, 1 present
 * WORKDIR: 0 absent, 1 same as HEAD, 2 differs from HEAD
 * STAGE:   0 absent, 1 same as HEAD, 2 same as WORKDIR, 3 differs from WORKDIR
 */
export function classifyStatusRow([path, head, workdir, stage]: StatusRow): GitStatusEntry {
  const inHead = head === 1;
  const inWorkdir = workdir !== 0;
  const inIndex = stage !== 0;

  let staged: StagedChange | null = null;
  if (!inHead && inIndex) staged = "added";
  else if (inHead && !inIndex) staged = "deleted";
  else if (inHead && stage !== 1) staged = "modified";

  const workdirDiffersFromIndex = stage === 3 || (stage === 1 && workdir === 2);
  let unstaged: UnstagedChange | null = null;
  if (!inIndex && inWorkdir) unstaged = "untracked";
  else if (inIndex && !inWorkdir) unstaged = "deleted";
  else if (inIndex && workdirDiffersFromIndex) unstaged = "modified";

  return { path, inHead, inIndex, inWorkdir, staged, unstaged };
}

export async function readStatusEntries(ctx: GitContext): Promise<GitStatusEntry[]> {
  const matrix = await git.statusMatrix({ fs: ctx.fs, dir: ctx.dir });
  return matrix
    .map((row) => classifyStatusRow(row as StatusRow))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function hasStagedChanges(entries: GitStatusEntry[]): boolean {
  return entries.some((entry) => entry.staged !== null);
}
