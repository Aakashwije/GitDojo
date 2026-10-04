import { type GitEngine } from "@gitdojo/git-engine";
import { type GitErrorCode } from "@gitdojo/shared-types";
import { type SupportedGitCommand } from "../commands";
import { type ParseErrorCode } from "../errors";

export interface CommandExecutionContext {
  workspaceId: string;
  git: GitEngine;
}

export type CommandErrorCode = GitErrorCode | ParseErrorCode | "INTERNAL";

/** A Git subcommand GitDojo can run, e.g. `commit` or `cherry-pick`. */
export type GitCommandName = SupportedGitCommand;

export interface CommandExecutionResult {
  ok: boolean;
  /** Terminal-ready output. May be empty (e.g. `git add`). */
  output: string;
  /** Kept for future educational explanations; not shown to learners directly. */
  errorCode?: CommandErrorCode;
  /** Set by `clear`: the terminal should wipe its screen. */
  clearScreen?: boolean;
  /**
   * The supported Git subcommand this line ran (`git commit` → `commit`), whether or not it
   * succeeded, so usage can be counted from what was actually executed. Absent for `help`,
   * `clear`, other programs and unsupported Git commands.
   */
  gitCommand?: GitCommandName;
}
