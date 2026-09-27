import { type GitCommandResult } from "@gitdojo/shared-types";
import { runAdd } from "../commands/add";
import { runCommit } from "../commands/commit";
import { runInit } from "../commands/init";
import { runLog } from "../commands/log";
import { readSnapshot } from "../commands/snapshot";
import { runStatus } from "../commands/status";
import { type GitDojoFs } from "../filesystem/types";
import { workspaceRoot } from "../filesystem/paths";
import { type GitContext } from "./context";
import { unexpected } from "./errors";
import {
  type GitAddResult,
  type GitCommitInput,
  type GitCommitResult,
  type GitEngine,
  type GitInitResult,
  type GitLogOptions,
  type GitLogResult,
  type GitRepositorySnapshot,
  type GitStatusResult,
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

  snapshot(): Promise<GitRepositorySnapshot> {
    return readSnapshot(this.ctx);
  }
}

export function createGitEngine(options: GitEngineOptions): GitEngine {
  return new IsomorphicGitEngine(options);
}
