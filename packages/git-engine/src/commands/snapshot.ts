import git from "isomorphic-git";
import { WorkspaceFileSystem } from "../filesystem/workspace-file-system";
import { type GitContext } from "../engine/context";
import { type GitBranchInfo, type GitRepositorySnapshot } from "../engine/git-engine";
import {
  currentBranch,
  isRepository,
  readCommitsFromHead,
  resolveRefOrNull,
} from "../engine/repository";
import { readStatusEntries } from "../engine/status-matrix";

export async function readSnapshot(ctx: GitContext): Promise<GitRepositorySnapshot> {
  if (!(await isRepository(ctx))) {
    // Without a repository every file is simply "not tracked"; report them as untracked so the
    // UI can still show what is in the working directory.
    const files = await new WorkspaceFileSystem(ctx.fs).listFiles(ctx.workspaceId);
    return {
      initialized: false,
      currentBranch: null,
      head: null,
      branches: [],
      commits: [],
      entries: files
        .filter((file) => file.type === "file")
        .map((file) => ({
          path: file.path,
          inHead: false,
          inIndex: false,
          inWorkdir: true,
          staged: null,
          unstaged: "untracked",
        })),
    };
  }

  const [branch, head, entries, branchNames] = await Promise.all([
    currentBranch(ctx),
    resolveRefOrNull(ctx, "HEAD"),
    readStatusEntries(ctx),
    git.listBranches({ fs: ctx.fs, dir: ctx.dir }),
  ]);

  const branches: GitBranchInfo[] = await Promise.all(
    branchNames.map(async (name) => ({ name, oid: await resolveRefOrNull(ctx, name) })),
  );
  // An unborn branch has no ref yet, but learners still expect to see it.
  if (branch !== null && !branches.some((info) => info.name === branch)) {
    branches.unshift({ name: branch, oid: null });
  }

  return {
    initialized: true,
    currentBranch: branch,
    head,
    branches,
    commits: head === null ? [] : await readCommitsFromHead(ctx),
    entries,
  };
}
