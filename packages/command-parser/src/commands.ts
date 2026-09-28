import { type GitCommandSpec } from "./types";

/** Git commands GitDojo can execute. Adding a command starts here. */
export const GIT_COMMAND_SPECS = {
  init: {
    name: "init",
    summary: "Create an empty Git repository",
    usage: "git init",
    flags: [],
    acceptsArguments: false,
  },
  status: {
    name: "status",
    summary: "Show the working tree status",
    usage: "git status",
    flags: [],
    acceptsArguments: false,
  },
  add: {
    name: "add",
    summary: "Stage file contents (use . for everything)",
    usage: "git add <path>...",
    flags: [],
    acceptsArguments: true,
  },
  commit: {
    name: "commit",
    summary: "Record staged changes as a new commit",
    usage: 'git commit -m "<message>"',
    flags: [{ name: "m", aliases: ["message"], takesValue: true, repeatSeparator: "\n\n" }],
    requiredFlags: [{ name: "m", message: "error: commit message is required" }],
    acceptsArguments: false,
  },
  log: {
    name: "log",
    summary: "Show commit history",
    usage: "git log [--oneline]",
    flags: [{ name: "oneline", takesValue: false }],
    acceptsArguments: false,
  },
  branch: {
    name: "branch",
    summary: "List branches, or create one",
    usage: "git branch [<name>]",
    flags: [],
    acceptsArguments: true,
    maxArguments: 1,
  },
  switch: {
    name: "switch",
    summary: "Switch branches (-c creates one first)",
    usage: "git switch [-c] <branch>",
    flags: [{ name: "c", aliases: ["create"], takesValue: true }],
    acceptsArguments: true,
    maxArguments: 1,
  },
  checkout: {
    name: "checkout",
    summary: "Older way to switch branches (prefer git switch)",
    usage: "git checkout [-b] <branch>",
    flags: [{ name: "b", takesValue: true }],
    acceptsArguments: true,
    maxArguments: 1,
  },
} as const satisfies Record<string, GitCommandSpec>;

export type SupportedGitCommand = keyof typeof GIT_COMMAND_SPECS;

export function isSupportedGitCommand(command: string): command is SupportedGitCommand {
  return Object.hasOwn(GIT_COMMAND_SPECS, command);
}

/** Real Git commands that later GitDojo phases will support; they get a friendlier message. */
export const PLANNED_GIT_COMMANDS: ReadonlySet<string> = new Set([
  "cherry-pick",
  "clone",
  "config",
  "diff",
  "fetch",
  "merge",
  "mv",
  "pull",
  "push",
  "rebase",
  "reflog",
  "remote",
  "reset",
  "restore",
  "revert",
  "rm",
  "show",
  "stash",
  "tag",
]);

/** Terminal built-ins. They are parsed like any other input and never reach an OS shell. */
export const BUILTIN_PROGRAMS = {
  clear: "Clear the terminal",
  help: "Show available commands",
} as const;

export type BuiltinProgram = keyof typeof BUILTIN_PROGRAMS;

export function isBuiltinProgram(program: string): program is BuiltinProgram {
  return Object.hasOwn(BUILTIN_PROGRAMS, program);
}
