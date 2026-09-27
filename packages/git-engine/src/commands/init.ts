import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { success } from "../engine/errors";
import { DEFAULT_BRANCH, type GitInitResult } from "../engine/git-engine";
import { isRepository } from "../engine/repository";

export async function runInit(ctx: GitContext): Promise<GitInitResult> {
  const reinitialized = await isRepository(ctx);
  if (!reinitialized) {
    await git.init({ fs: ctx.fs, dir: ctx.dir, defaultBranch: DEFAULT_BRANCH });
  }
  const verb = reinitialized ? "Reinitialized existing" : "Initialized empty";
  return success(`${verb} Git repository in ${ctx.displayDir}/.git/`, {
    reinitialized,
    defaultBranch: DEFAULT_BRANCH,
  });
}
