import { type CommandExecutionResult } from "@gitdojo/command-parser";
import { type RepositoryState } from "@gitdojo/shared-types";
import { type GitEditorDecision } from "../state/use-git-editor-store";
import { type CommandOutcome } from "./workspace-session";

/** The part of a session that can answer Git's editor. */
export interface EditorSession<S> {
  closeEditor(content: string): Promise<CommandOutcome<S>>;
  abortEditor(): Promise<CommandOutcome<S>>;
}

/**
 * Carries a command on while Git waits for the editor: asks for the edited text, hands it to
 * Git, and repeats while Git asks again (a reworded message after the todo list, or the same
 * file after an invalid edit). Returns the command's whole result once Git stops waiting, with
 * every step's output in order, the way a terminal would show it.
 */
export async function settleEditor<S>(
  session: EditorSession<S>,
  outcome: CommandOutcome<S>,
  repositoryOf: (snapshot: S) => RepositoryState,
  ask: (editor: NonNullable<RepositoryState["editor"]>) => Promise<GitEditorDecision>,
  publish: (snapshot: S) => void,
): Promise<CommandOutcome<S>> {
  let { result, snapshot } = outcome;
  const outputs = [result.output];
  for (let editor = repositoryOf(snapshot).editor; editor; editor = repositoryOf(snapshot).editor) {
    const decision = await ask(editor);
    const next =
      decision.action === "save"
        ? await session.closeEditor(decision.content)
        : await session.abortEditor();
    publish(next.snapshot);
    snapshot = next.snapshot;
    outputs.push(next.result.output);
    result = next.result;
  }
  if (outputs.length === 1) return { result, snapshot };
  const merged: CommandExecutionResult = {
    ...result,
    output: outputs.filter((output) => output !== "").join("\n"),
    ...(outcome.result.gitCommand ? { gitCommand: outcome.result.gitCommand } : {}),
  };
  return { result: merged, snapshot };
}
