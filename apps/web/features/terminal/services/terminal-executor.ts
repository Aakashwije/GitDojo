import { type CommandExecutionResult } from "@gitdojo/command-parser";
import { highlightOutput } from "./highlight-output";

export interface TerminalResponse {
  /** ANSI-formatted text to print (may be empty). */
  text: string;
  /** Plain text, for screen-reader announcements and copying. */
  plainText: string;
  clearScreen: boolean;
}

export type TerminalExecutor = (input: string) => Promise<TerminalResponse>;

/**
 * Adapts command execution to terminal rendering. The terminal never interprets commands
 * itself: every line goes to `execute`, which runs it through the parser and router.
 */
export function createTerminalExecutor(
  execute: (input: string) => Promise<CommandExecutionResult>,
): TerminalExecutor {
  return async (input) => {
    const result = await execute(input);
    return {
      text: result.output === "" ? "" : highlightOutput(result.output, result.ok),
      plainText: result.output,
      clearScreen: result.clearScreen ?? false,
    };
  };
}
