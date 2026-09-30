import { MERGE_USAGE } from "@gitdojo/git-engine";
import { type GitCommandResult } from "@gitdojo/shared-types";
import { isBuiltinProgram, isSupportedGitCommand, type SupportedGitCommand } from "../commands";
import { parseCommand, notAGitCommandMessage } from "../parser";
import { type ParsedCommand } from "../types";
import { helpText } from "./help";
import { type CommandExecutionContext, type CommandExecutionResult } from "./types";

type GitHandler = (
  parsed: ParsedCommand,
  context: CommandExecutionContext,
) => Promise<GitCommandResult>;

const gitHandlers: Record<SupportedGitCommand, GitHandler> = {
  init: (_parsed, { git }) => git.init(),
  status: (_parsed, { git }) => git.status(),
  add: (parsed, { git }) => git.add(parsed.args),
  commit: (parsed, { git }) => {
    const message = parsed.flags.m;
    return git.commit({ message: typeof message === "string" ? message : "" });
  },
  log: (parsed, { git }) => git.log({ oneline: parsed.flags.oneline === true }),
  branch: (parsed, { git }) => {
    const [name] = parsed.args;
    return name === undefined ? git.showBranches() : git.createBranch(name);
  },
  switch: (parsed, { git }) => {
    const create = parsed.flags.c;
    if (typeof create === "string") {
      return parsed.args.length > 0
        ? invalidArgument(startPointUnsupported("git switch -c"))
        : git.createAndSwitchBranch(create);
    }
    return git.switchBranch(parsed.args[0] ?? "");
  },
  merge: (parsed, { git }) => {
    if (parsed.flags.abort === true) {
      return parsed.args.length > 0
        ? invalidArgument(`error: --abort takes no branch\n${MERGE_USAGE}`)
        : git.abortMerge();
    }
    return git.merge(parsed.args[0] ?? "", { noFastForward: parsed.flags["no-ff"] === true });
  },
  // Kept for comparison with older tutorials. Only the branch-switching forms are supported.
  checkout: async (parsed, { git }) => {
    const create = parsed.flags.b;
    if (typeof create === "string") {
      return parsed.args.length > 0
        ? invalidArgument(startPointUnsupported("git checkout -b"))
        : git.createAndSwitchBranch(create);
    }
    const [name] = parsed.args;
    if (name === undefined) {
      return invalidArgument(
        "fatal: GitDojo needs a branch to check out\nusage: git checkout [-b] <branch>",
      );
    }
    const result = await git.switchBranch(name);
    if (result.error?.code !== "BRANCH_NOT_FOUND") return result;
    // `git checkout` also restores files, so Git reports an unknown name as a pathspec.
    const message = `error: pathspec '${name}' did not match any file(s) known to git`;
    return { ...result, output: message, error: { ...result.error, message } };
  },
};

function invalidArgument(message: string): Promise<GitCommandResult> {
  return Promise.resolve({
    ok: false,
    output: message,
    error: { code: "INVALID_ARGUMENT", message },
  });
}

function startPointUnsupported(command: string): string {
  return `fatal: GitDojo cannot create a branch at another commit yet.\nRun '${command} <name>' to branch from where you are.`;
}

function fromGitResult(result: GitCommandResult): CommandExecutionResult {
  return result.ok
    ? { ok: true, output: result.output }
    : { ok: false, output: result.output, errorCode: result.error?.code ?? "UNKNOWN" };
}

async function dispatch(
  parsed: ParsedCommand,
  context: CommandExecutionContext,
): Promise<CommandExecutionResult> {
  if (isBuiltinProgram(parsed.program)) {
    return parsed.program === "clear"
      ? { ok: true, output: "", clearScreen: true }
      : { ok: true, output: helpText() };
  }

  if (parsed.program !== "git") {
    return {
      ok: false,
      output: `${parsed.program}: command not found`,
      errorCode: "UNSUPPORTED_PROGRAM",
    };
  }

  const command = parsed.command ?? "";
  if (!isSupportedGitCommand(command)) {
    return {
      ok: false,
      output: notAGitCommandMessage(command),
      errorCode: "UNSUPPORTED_GIT_COMMAND",
    };
  }

  return fromGitResult(await gitHandlers[command](parsed, context));
}

/**
 * Routes an already-parsed command to the Git engine. Never rejects: unexpected failures are
 * converted to a generic message so no stack trace ever reaches the terminal.
 */
export async function executeCommand(
  parsed: ParsedCommand,
  context: CommandExecutionContext,
): Promise<CommandExecutionResult> {
  try {
    return await dispatch(parsed, context);
  } catch (error) {
    // Keep the details for developers; learners only see a generic message.
    console.error("[gitdojo] command execution failed", error);
    return {
      ok: false,
      output: "fatal: something went wrong while running that command.",
      errorCode: "INTERNAL",
    };
  }
}

/** Parses and executes one line of raw terminal input. */
export async function runCommandLine(
  raw: string,
  context: CommandExecutionContext,
): Promise<CommandExecutionResult> {
  const parsed = parseCommand(raw);
  if (!parsed.ok) {
    return { ok: false, output: parsed.error.message, errorCode: parsed.error.code };
  }
  return executeCommand(parsed.command, context);
}
