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
import { runCloseEditor, runRebase, runRebaseControl } from "../commands/rebase";
import {
  runFetch,
  runListRemotes,
  runPull,
  runPush,
  runSetupRemote,
  runSetupRemoteCommit,
} from "../commands/remote";
import { runCreateTag, runDeleteTag, runListTags } from "../commands/tag";
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
import { assessmentEvidence } from "./assessment-evidence";
import { editorOpenMessage, readEditorRecord } from "./editor-state";
import { failure, gitError, unexpected } from "./errors";
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
  type GitFetchResult,
  type GitPullOptions,
  type GitPullResult,
  type GitPushOptions,
  type GitPushResult,
  type GitRebaseOptions,
  type GitRemoteResult,
  type GitSetupRemoteCommitInput,
  type GitSetupRemoteOptions,
  type GitShowBranchesOptions,
  type GitTagCreateOptions,
  type GitTagListOptions,
  type GitTagResult,
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

/**
 * Like {@link guard}, for commands that change the repository: while Git waits for an editor
 * (`git rebase -i`), they are refused, as a real terminal would be busy until the editor closes.
 */
async function mutating<T>(
  ctx: GitContext,
  operation: () => Promise<GitCommandResult<T>>,
): Promise<GitCommandResult<T>> {
  return guard(async () => {
    const editor = await readEditorRecord(ctx).catch(() => null);
    if (editor) return failure(gitError("EDITOR_OPEN", editorOpenMessage(editor)));
    return operation();
  });
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
    return mutating(this.ctx, () => runInit(this.ctx));
  }

  status(): Promise<GitStatusResult> {
    return guard(() => runStatus(this.ctx));
  }

  add(paths: string[]): Promise<GitAddResult> {
    return mutating(this.ctx, () => runAdd(this.ctx, paths));
  }

  commit(input: GitCommitInput): Promise<GitCommitResult> {
    return mutating(this.ctx, () => runCommit(this.ctx, input));
  }

  log(options?: GitLogOptions): Promise<GitLogResult> {
    return guard(() => runLog(this.ctx, options));
  }

  showBranches(options?: GitShowBranchesOptions): Promise<GitBranchListResult> {
    return guard(() => runShowBranches(this.ctx, options));
  }

  createBranch(name: string, startPoint?: string): Promise<GitBranchCreateResult> {
    return mutating(this.ctx, () => runCreateBranch(this.ctx, name, startPoint));
  }

  deleteBranch(name: string, options?: { force?: boolean }): Promise<GitBranchDeleteResult> {
    return mutating(this.ctx, () => runDeleteBranch(this.ctx, name, options));
  }

  switchBranch(name: string): Promise<GitSwitchResult> {
    return mutating(this.ctx, () => runSwitch(this.ctx, name, { create: false }));
  }

  createAndSwitchBranch(name: string, startPoint?: string): Promise<GitSwitchResult> {
    return mutating(this.ctx, () => runSwitch(this.ctx, name, { create: true, startPoint }));
  }

  detachHead(revision: string, options?: GitDetachOptions): Promise<GitSwitchResult> {
    return mutating(this.ctx, () => runDetach(this.ctx, revision, options));
  }

  merge(branch: string, options?: GitMergeOptions): Promise<GitMergeResult> {
    return mutating(this.ctx, () => runMerge(this.ctx, branch, options));
  }

  abortMerge(): Promise<GitAbortMergeResult> {
    return mutating(this.ctx, () => runAbortMerge(this.ctx));
  }

  diff(options?: GitDiffOptions): Promise<GitDiffResult> {
    return guard(() => runDiff(this.ctx, options));
  }

  restore(paths: string[], options?: GitRestoreOptions): Promise<GitRestoreResult> {
    return mutating(this.ctx, () => runRestore(this.ctx, paths, options));
  }

  reset(options?: GitResetOptions): Promise<GitResetResult> {
    return mutating(this.ctx, () => runReset(this.ctx, options));
  }

  revert(commit: string): Promise<GitPickResult> {
    return mutating(this.ctx, () => runPick(this.ctx, "revert", commit));
  }

  cherryPick(commit: string): Promise<GitPickResult> {
    return mutating(this.ctx, () => runPick(this.ctx, "cherry-pick", commit));
  }

  sequencer(
    operation: "revert" | "cherry-pick",
    action: GitSequencerAction,
  ): Promise<GitPickResult> {
    return mutating(this.ctx, () =>
      runSequencer(this.ctx, operation, action, async (ctx) => {
        const result = await runCommit(ctx, { message: "" });
        return { ...result, data: result.data ? { oid: result.data.oid } : {} };
      }),
    );
  }

  stashPush(options?: GitStashPushOptions): Promise<GitStashResult> {
    return mutating(this.ctx, () => runStashPush(this.ctx, options));
  }

  stashList(): Promise<GitStashResult> {
    return guard(() => runStashList(this.ctx));
  }

  stashApply(stash?: string, options?: { pop?: boolean }): Promise<GitStashResult> {
    return mutating(this.ctx, () => runStashApply(this.ctx, stash, options));
  }

  stashDrop(stash?: string): Promise<GitStashResult> {
    return mutating(this.ctx, () => runStashDrop(this.ctx, stash));
  }

  stashShow(stash?: string): Promise<GitStashResult> {
    return guard(() => runStashShow(this.ctx, stash));
  }

  reflog(ref?: string): Promise<GitReflogResult> {
    return guard(() => runReflog(this.ctx, ref));
  }

  rebase(upstream: string, options?: GitRebaseOptions): Promise<GitRebaseResult> {
    return mutating(this.ctx, () => runRebase(this.ctx, upstream, options));
  }

  closeEditor(content: string): Promise<GitRebaseResult> {
    return guard(() => runCloseEditor(this.ctx, content));
  }

  listTags(options?: GitTagListOptions): Promise<GitTagResult> {
    return guard(() => runListTags(this.ctx, options));
  }

  createTag(name: string, options?: GitTagCreateOptions): Promise<GitTagResult> {
    return mutating(this.ctx, () => runCreateTag(this.ctx, name, options));
  }

  deleteTag(name: string): Promise<GitTagResult> {
    return mutating(this.ctx, () => runDeleteTag(this.ctx, name));
  }

  listRemotes(options?: { verbose?: boolean }): Promise<GitRemoteResult> {
    return guard(() => runListRemotes(this.ctx, options));
  }

  fetch(remote?: string): Promise<GitFetchResult> {
    return mutating(this.ctx, () => runFetch(this.ctx, remote));
  }

  push(options?: GitPushOptions): Promise<GitPushResult> {
    return mutating(this.ctx, () => runPush(this.ctx, options));
  }

  pull(options?: GitPullOptions): Promise<GitPullResult> {
    return mutating(this.ctx, () => runPull(this.ctx, options));
  }

  setupRemote(name: string, options: GitSetupRemoteOptions): Promise<GitCommandResult> {
    return guard(() => runSetupRemote(this.ctx, name, options));
  }

  setupRemoteCommit(name: string, input: GitSetupRemoteCommitInput): Promise<GitCommandResult> {
    return guard(() => runSetupRemoteCommit(this.ctx, name, input));
  }

  rebaseControl(action: GitSequencerAction): Promise<GitRebaseResult> {
    return guard(() => runRebaseControl(this.ctx, action));
  }

  rm(paths: string[], options?: GitRmOptions): Promise<GitRmResult> {
    return mutating(this.ctx, () => runRm(this.ctx, paths, options));
  }

  listBranches(): Promise<BranchState[]> {
    return readBranches(this.ctx);
  }

  snapshot(): Promise<GitRepositorySnapshot> {
    return readSnapshot(this.ctx);
  }

  exportAssessmentEvidence(attemptId: string) {
    return assessmentEvidence(this.ctx, attemptId);
  }
}

export function createGitEngine(options: GitEngineOptions): GitEngine {
  return new IsomorphicGitEngine(options);
}
