import { type BranchState, type GitCommandResult } from "@gitdojo/shared-types";
import { runAdd } from "../commands/add";
import { readBranches, runCreateBranch, runShowBranches } from "../commands/branch";
import { runCommit } from "../commands/commit";
import { runInit } from "../commands/init";
import { runLog } from "../commands/log";
import { runAbortMerge, runMerge } from "../commands/merge";
import { readSnapshot } from "../commands/snapshot";
import { runStatus } from "../commands/status";
import { runSwitch } from "../commands/switch";
import { type GitDojoFs } from "../filesystem/types";
import { workspaceRoot } from "../filesystem/paths";
import { type GitContext } from "./context";
import { unexpected } from "./errors";
import {
  type GitAbortMergeResult,
  type GitAddResult,
  type GitBranchCreateResult,
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

  createBranch(name: string): Promise<GitBranchCreateResult> {
    return guard(() => runCreateBranch(this.ctx, name));
  }

  switchBranch(name: string): Promise<GitSwitchResult> {
    return guard(() => runSwitch(this.ctx, name, { create: false }));
  }

  createAndSwitchBranch(name: string): Promise<GitSwitchResult> {
    return guard(() => runSwitch(this.ctx, name, { create: true }));
  }

  merge(branch: string, options?: GitMergeOptions): Promise<GitMergeResult> {
    return guard(() => runMerge(this.ctx, branch, options));
  }

  abortMerge(): Promise<GitAbortMergeResult> {
    return guard(() => runAbortMerge(this.ctx));
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
