import { type BranchState, type GitCommandResult } from "@gitdojo/shared-types";
import { runAdd } from "../commands/add";
import {
  readBranches,
  runCreateBranch,
  runDeleteBranch,
  runShowBranches,
} from "../commands/branch";
import { runCommit } from "../commands/commit";
import { runDiff } from "../commands/diff";
import { runInit } from "../commands/init";
import { runLog } from "../commands/log";
import { runPick, runSequencer } from "../commands/pick";
import { runRebase, runRebaseControl } from "../commands/rebase";
import { runReflog } from "../commands/reflog";
import { runReset } from "../commands/reset";
import { runRestore } from "../commands/restore";
import { runRm } from "../commands/rm";
import { runAbortMerge, runMerge } from "../commands/merge";
import { readSnapshot } from "../commands/snapshot";
import {
  runStashApply,
  runStashDrop,
  runStashList,
  runStashPush,
  runStashShow,
} from "../commands/stash";
import { runStatus } from "../commands/status";
import { runDetach, runSwitch } from "../commands/switch";
import { type GitDojoFs } from "../filesystem/types";
import { workspaceRoot } from "../filesystem/paths";
import { type GitContext } from "./context";
import { unexpected } from "./errors";
import {
  type GitAbortMergeResult,
  type GitAddResult,
  type GitBranchCreateResult,
  type GitBranchDeleteResult,
  type GitDetachOptions,
  type GitDiffOptions,
  type GitDiffResult,
  type GitPickResult,
  type GitRebaseResult,
  type GitReflogResult,
  type GitResetOptions,
  type GitResetResult,
  type GitRestoreOptions,
  type GitRestoreResult,
  type GitRmOptions,
  type GitRmResult,
  type GitSequencerAction,
  type GitStashPushOptions,
  type GitStashResult,
  type GitBranchListResult,
  type GitCommitInput,
  type GitCommitResult,
  type GitEngine,
  type GitInitResult,
  type GitLogOptions,
  type GitLogResult,
  type GitMergeOptions,
  type GitMergeResult,
  type GitRepositorySnapshot,
  type GitStatusResult,
  type GitSwitchResult,
} from "./git-engine";

export interface GitEngineOptions {
  fs: GitDojoFs;
  workspaceId: string;
  /** Directory name shown to learners. Defaults to `~/project`. */
  displayDir?: string;
}

async function guard<T>(
  operation: () => Promise<GitCommandResult<T>>,
): Promise<GitCommandResult<T>> {
  try {
    return await operation();
  } catch (error) {
    return unexpected(error);
  }
}

/** {@link GitEngine} backed by isomorphic-git. This is the only module family that imports it. */
export class IsomorphicGitEngine implements GitEngine {
  readonly workspaceId: string;
  private readonly ctx: GitContext;

  constructor({ fs, workspaceId, displayDir = "~/project" }: GitEngineOptions) {
    this.workspaceId = workspaceId;
    this.ctx = { fs, dir: workspaceRoot(workspaceId), workspaceId, displayDir };
  }

  init(): Promise<GitInitResult> {
    return guard(() => runInit(this.ctx));
  }

  status(): Promise<GitStatusResult> {
    return guard(() => runStatus(this.ctx));
  }

  add(paths: string[]): Promise<GitAddResult> {
    return guard(() => runAdd(this.ctx, paths));
  }

  commit(input: GitCommitInput): Promise<GitCommitResult> {
    return guard(() => runCommit(this.ctx, input));
  }

  log(options?: GitLogOptions): Promise<GitLogResult> {
    return guard(() => runLog(this.ctx, options));
  }

  showBranches(): Promise<GitBranchListResult> {
    return guard(() => runShowBranches(this.ctx));
  }

  createBranch(name: string, startPoint?: string): Promise<GitBranchCreateResult> {
    return guard(() => runCreateBranch(this.ctx, name, startPoint));
  }

  deleteBranch(name: string, options?: { force?: boolean }): Promise<GitBranchDeleteResult> {
    return guard(() => runDeleteBranch(this.ctx, name, options));
  }

  switchBranch(name: string): Promise<GitSwitchResult> {
    return guard(() => runSwitch(this.ctx, name, { create: false }));
  }

  createAndSwitchBranch(name: string, startPoint?: string): Promise<GitSwitchResult> {
    return guard(() => runSwitch(this.ctx, name, { create: true, startPoint }));
  }

  detachHead(revision: string, options?: GitDetachOptions): Promise<GitSwitchResult> {
    return guard(() => runDetach(this.ctx, revision, options));
  }

  merge(branch: string, options?: GitMergeOptions): Promise<GitMergeResult> {
    return guard(() => runMerge(this.ctx, branch, options));
  }

  abortMerge(): Promise<GitAbortMergeResult> {
    return guard(() => runAbortMerge(this.ctx));
  }

  diff(options?: GitDiffOptions): Promise<GitDiffResult> {
    return guard(() => runDiff(this.ctx, options));
  }

  restore(paths: string[], options?: GitRestoreOptions): Promise<GitRestoreResult> {
    return guard(() => runRestore(this.ctx, paths, options));
  }

  reset(options?: GitResetOptions): Promise<GitResetResult> {
    return guard(() => runReset(this.ctx, options));
  }

  revert(commit: string): Promise<GitPickResult> {
    return guard(() => runPick(this.ctx, "revert", commit));
  }

  cherryPick(commit: string): Promise<GitPickResult> {
    return guard(() => runPick(this.ctx, "cherry-pick", commit));
  }

  sequencer(
    operation: "revert" | "cherry-pick",
    action: GitSequencerAction,
  ): Promise<GitPickResult> {
    return guard(() =>
      runSequencer(this.ctx, operation, action, async (ctx) => {
        const result = await runCommit(ctx, { message: "" });
        return { ...result, data: result.data ? { oid: result.data.oid } : {} };
      }),
    );
  }

  stashPush(options?: GitStashPushOptions): Promise<GitStashResult> {
    return guard(() => runStashPush(this.ctx, options));
  }

  stashList(): Promise<GitStashResult> {
    return guard(() => runStashList(this.ctx));
  }

  stashApply(stash?: string, options?: { pop?: boolean }): Promise<GitStashResult> {
    return guard(() => runStashApply(this.ctx, stash, options));
  }

  stashDrop(stash?: string): Promise<GitStashResult> {
    return guard(() => runStashDrop(this.ctx, stash));
  }

  stashShow(stash?: string): Promise<GitStashResult> {
    return guard(() => runStashShow(this.ctx, stash));
  }

  reflog(ref?: string): Promise<GitReflogResult> {
    return guard(() => runReflog(this.ctx, ref));
  }

  rebase(upstream: string): Promise<GitRebaseResult> {
    return guard(() => runRebase(this.ctx, upstream));
  }

  rebaseControl(action: GitSequencerAction): Promise<GitRebaseResult> {
    return guard(() => runRebaseControl(this.ctx, action));
  }

  rm(paths: string[], options?: GitRmOptions): Promise<GitRmResult> {
    return guard(() => runRm(this.ctx, paths, options));
  }

  listBranches(): Promise<BranchState[]> {
    return readBranches(this.ctx);
  }

  snapshot(): Promise<GitRepositorySnapshot> {
    return readSnapshot(this.ctx);
  }
}

export function createGitEngine(options: GitEngineOptions): GitEngine {
  return new IsomorphicGitEngine(options);
}
