import { MERGE_USAGE, REBASE_USAGE, type GitSequencerAction } from "@gitdojo/git-engine";
import { type GitCommandResult } from "@gitdojo/shared-types";
import {
  GIT_COMMAND_SPECS,
  isBuiltinProgram,
  isSupportedGitCommand,
  type SupportedGitCommand,
} from "../commands";
import { parseCommand, notAGitCommandMessage } from "../parser";
import { tokenize } from "../tokenizer";
import { type ParsedCommand } from "../types";
import { helpText } from "./help";
import { type CommandExecutionContext, type CommandExecutionResult } from "./types";

type GitHandler = (
  parsed: ParsedCommand,
  context: CommandExecutionContext,
) => Promise<GitCommandResult>;

type StashHandler = (
  parsed: ParsedCommand,
  /** The stash entry (`stash@{1}`) or pathspec after the subcommand. */
  reference: string | undefined,
  context: CommandExecutionContext,
) => Promise<GitCommandResult>;

const pushStash: StashHandler = (parsed, reference, { git }) => {
  if (reference !== undefined) {
    return invalidArgument("fatal: GitDojo stashes all changes; pathspecs are not supported");
  }
  const message = parsed.flags.m;
  return git.stashPush({
    ...(typeof message === "string" ? { message } : {}),
    includeUntracked: parsed.flags.u === true,
  });
};

/** `git stash <subcommand>`; a bare `git stash` is `push`. */
const stashSubcommands = {
  push: pushStash,
  save: pushStash,
  list: (_parsed, _reference, { git }) => git.stashList(),
  apply: (_parsed, reference, { git }) => git.stashApply(reference),
  pop: (_parsed, reference, { git }) => git.stashApply(reference, { pop: true }),
  drop: (_parsed, reference, { git }) => git.stashDrop(reference),
  show: (_parsed, reference, { git }) => git.stashShow(reference),
} satisfies Record<string, StashHandler>;

function isStashSubcommand(name: string): name is keyof typeof stashSubcommands {
  return Object.hasOwn(stashSubcommands, name);
}

const gitHandlers: Record<SupportedGitCommand, GitHandler> = {
  init: (_parsed, { git }) => git.init(),
  status: (_parsed, { git }) => git.status(),
  add: (parsed, { git }) => git.add(parsed.args),
  commit: (parsed, { git }) => {
    const message = parsed.flags.m;
    return git.commit({ message: typeof message === "string" ? message : "" });
  },
  log: (parsed, { git }) => {
    const [revision] = parsed.args;
    return git.log({
      oneline: parsed.flags.oneline === true,
      all: parsed.flags.all === true,
      ...(revision === undefined ? {} : { revision }),
    });
  },
  branch: (parsed, { git }) => {
    const [name, startPoint] = parsed.args;
    const remove = parsed.flags.d === true || parsed.flags.D === true;
    if (remove) {
      if (startPoint !== undefined) {
        return invalidArgument("fatal: GitDojo deletes one branch at a time");
      }
      return git.deleteBranch(name ?? "", { force: parsed.flags.D === true });
    }
    if (name === undefined) return git.showBranches();
    return git.createBranch(name, startPoint);
  },
  switch: (parsed, { git }) => {
    const create = parsed.flags.c;
    const [target] = parsed.args;
    if (typeof create === "string") {
      if (parsed.flags.detach === true) {
        return invalidArgument("fatal: options '-c' and '--detach' cannot be used together");
      }
      return git.createAndSwitchBranch(create, target);
    }
    // `git switch --detach` alone detaches at the current commit, like Git.
    if (parsed.flags.detach === true) return git.detachHead(target ?? "HEAD");
    return git.switchBranch(target ?? "");
  },
  merge: (parsed, { git }) => {
    if (parsed.flags.abort === true) {
      return parsed.args.length > 0
        ? invalidArgument(`error: --abort takes no branch\n${MERGE_USAGE}`)
        : git.abortMerge();
    }
    if (parsed.flags["no-ff"] === true && parsed.flags["ff-only"] === true) {
      return invalidArgument("fatal: options '--no-ff' and '--ff-only' cannot be used together");
    }
    return git.merge(parsed.args[0] ?? "", {
      noFastForward: parsed.flags["no-ff"] === true,
      fastForwardOnly: parsed.flags["ff-only"] === true,
    });
  },
  diff: (parsed, { git }) => git.diff({ staged: parsed.flags.staged === true, paths: parsed.args }),
  restore: (parsed, { git }) => {
    const source = parsed.flags.source;
    return git.restore(parsed.args, {
      staged: parsed.flags.staged === true,
      worktree: parsed.flags.worktree === true || parsed.flags.staged !== true,
      ...(typeof source === "string" ? { source } : {}),
    });
  },
  rm: (parsed, { git }) =>
    git.rm(parsed.args, {
      cached: parsed.flags.cached === true,
      recursive: parsed.flags.r === true,
      force: parsed.flags.f === true,
    }),
  reset: (parsed, { git }) => {
    const modes = (["soft", "mixed", "hard"] as const).filter(
      (mode) => parsed.flags[mode] === true,
    );
    if (modes.length > 1) {
      return invalidArgument(
        `fatal: --${modes[0] ?? ""} and --${modes[1] ?? ""} cannot be used together`,
      );
    }
    // `git reset <commit> -- <paths>`: only words before `--` can be a commit.
    const split = parsed.pathsFrom ?? parsed.args.length;
    const [commit, ...rest] = parsed.args.slice(0, split);
    const paths = [...rest, ...parsed.args.slice(split)];
    return git.reset({
      ...(modes[0] ? { mode: modes[0] } : {}),
      ...(commit === undefined ? {} : { commit }),
      ...(paths.length > 0 ? { paths } : {}),
    });
  },
  revert: (parsed, { git }) => {
    const action = sequencerAction(parsed);
    if (action === "conflict")
      return invalidArgument("fatal: choose one of --continue, --abort and --skip");
    if (action) return git.sequencer("revert", action);
    return git.revert(parsed.args[0] ?? "");
  },
  "cherry-pick": (parsed, { git }) => {
    const action = sequencerAction(parsed);
    if (action === "conflict")
      return invalidArgument("fatal: choose one of --continue, --abort and --skip");
    if (action) return git.sequencer("cherry-pick", action);
    return git.cherryPick(parsed.args[0] ?? "");
  },
  stash: (parsed, context) => {
    const [first, reference] = parsed.args;
    const subcommand = first ?? "push";
    if (!isStashSubcommand(subcommand)) {
      return invalidArgument(
        `error: unknown subcommand: \`${subcommand}'\nusage: ${GIT_COMMAND_SPECS.stash.usage}`,
      );
    }
    return stashSubcommands[subcommand](parsed, reference, context);
  },
  reflog: (parsed, { git }) => {
    const [first, second] = parsed.args;
    // `git reflog show main` and `git reflog main` mean the same.
    const ref = first === "show" ? second : first;
    if (first === "show" || second === undefined) return git.reflog(ref ?? "HEAD");
    return invalidArgument(
      `fatal: unexpected argument '${second}'\nusage: git reflog [show] [<branch>]`,
    );
  },
  rebase: (parsed, { git }) => {
    if (parsed.flags.i === true) {
      return invalidArgument(
        "fatal: GitDojo does not support interactive rebase yet.\nhint: To squash commits, try 'git reset --soft <commit>' and commit again.",
      );
    }
    const action = sequencerAction(parsed);
    if (action === "conflict")
      return invalidArgument("fatal: choose one of --continue, --abort and --skip");
    if (action) return git.rebaseControl(action);
    return parsed.args[0] === undefined
      ? invalidArgument(REBASE_USAGE)
      : git.rebase(parsed.args[0]);
  },
  // Kept for comparison with older tutorials: switching branches and visiting commits.
  checkout: async (parsed, { git }) => {
    const create = parsed.flags.b;
    const [name] = parsed.args;
    if (typeof create === "string") return git.createAndSwitchBranch(create, name);
    if (name === undefined) {
      return invalidArgument(
        "fatal: GitDojo needs a branch or commit to check out\nusage: git checkout [-b <new-branch>] <branch | commit>",
      );
    }
    const isBranch = (await git.listBranches()).some(
      (branch) => branch.name === name && branch.oid,
    );
    if (isBranch || name === "-") return git.switchBranch(name);
    // Anything else that names a commit detaches HEAD there, with Git's long advice.
    const result = await git.detachHead(name, { advice: true });
    if (result.error?.code !== "INVALID_REVISION") return result;
    // `git checkout` also restores files, so Git reports an unknown name as a pathspec. The
    // learner almost always meant a branch, so that is the error code kept for explanations.
    const message = `error: pathspec '${name}' did not match any file(s) known to git`;
    return { ...result, output: message, error: { code: "BRANCH_NOT_FOUND", message } };
  },
};

/** `--continue`, `--abort` or `--skip`, if one (and only one) was given. */
function sequencerAction(parsed: ParsedCommand): GitSequencerAction | "conflict" | null {
  const actions = (["continue", "abort", "skip"] as const).filter(
    (action) => parsed.flags[action] === true,
  );
  if (actions.length > 1) return "conflict";
  return actions[0] ?? null;
}

function invalidArgument(message: string): Promise<GitCommandResult> {
  return Promise.resolve({
    ok: false,
    output: message,
    error: { code: "INVALID_ARGUMENT", message },
  });
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

  return { ...fromGitResult(await gitHandlers[command](parsed, context)), gitCommand: command };
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
    const command = parsed.program === "git" ? parsed.command : undefined;
    return {
      ok: false,
      output: "fatal: something went wrong while running that command.",
      errorCode: "INTERNAL",
      ...(command !== undefined && isSupportedGitCommand(command) ? { gitCommand: command } : {}),
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
    const gitCommand = submittedGitCommand(raw);
    return {
      ok: false,
      output: parsed.error.message,
      errorCode: parsed.error.code,
      // A supported command with bad arguments (`git branch a b c`) was still an attempt at it.
      ...(gitCommand ? { gitCommand } : {}),
    };
  }
  return executeCommand(parsed.command, context);
}

/** The supported Git subcommand a line asks for, even when it does not parse. */
function submittedGitCommand(raw: string): SupportedGitCommand | null {
  const tokens = tokenize(raw);
  const [program, command] = tokens.ok ? tokens.tokens : raw.trim().split(/\s+/);
  return program === "git" && command !== undefined && isSupportedGitCommand(command)
    ? command
    : null;
}
