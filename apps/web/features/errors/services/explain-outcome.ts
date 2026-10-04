import { type CommandExecutionResult } from "@gitdojo/command-parser";
import { explainCommand } from "@gitdojo/error-engine";
import { type RepositoryState } from "@gitdojo/shared-types";
import { useExplanationStore } from "../state/use-explanation-store";

/**
 * After every command: shows an explanation when the outcome deserves one, and clears the last
 * one otherwise, so the panel always describes the most recent command.
 */
export function explainOutcome(
  command: string,
  result: CommandExecutionResult,
  repository: RepositoryState,
): void {
  // `clear` and `help` are terminal housekeeping; leave the panel as it is.
  if (/^\s*(clear|help)\s*$/.test(command)) return;
  useExplanationStore.getState().show(
    explainCommand({
      command,
      ok: result.ok,
      output: result.output,
      ...(result.errorCode === undefined ? {} : { errorCode: result.errorCode }),
      repository,
    }),
  );
}
