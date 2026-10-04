import { type CommandExecutionResult } from "@gitdojo/command-parser";
import { recordProgress } from "../state/use-progress-store";

/**
 * Counts one submitted line if it ran a supported Git command, using the router's own record of
 * what ran and whether it succeeded. Help, `clear`, other programs, history navigation and
 * terminal redraws never reach here or carry no Git command, so they are not counted.
 */
export function recordCommand(result: CommandExecutionResult): void {
  if (result.gitCommand === undefined) return;
  void recordProgress({ type: "command", command: result.gitCommand, ok: result.ok });
}
