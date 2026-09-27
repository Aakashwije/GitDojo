import { type GitEngine } from "@gitdojo/git-engine";
import { type GitErrorCode } from "@gitdojo/shared-types";
import { type ParseErrorCode } from "../errors";

export interface CommandExecutionContext {
  workspaceId: string;
  git: GitEngine;
}

export type CommandErrorCode = GitErrorCode | ParseErrorCode | "INTERNAL";

export interface CommandExecutionResult {
  ok: boolean;
  /** Terminal-ready output. May be empty (e.g. `git add`). */
  output: string;
  /** Kept for future educational explanations; not shown to learners directly. */
  errorCode?: CommandErrorCode;
  /** Set by `clear`: the terminal should wipe its screen. */
  clearScreen?: boolean;
}
