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
    // `-m` is checked by the engine: while concluding a merge, `git commit` alone is enough.
    flags: [{ name: "m", aliases: ["message"], takesValue: true, repeatSeparator: "\n\n" }],
    acceptsArguments: false,
  },
  log: {
    name: "log",
    summary: "Show commit history (of HEAD, a branch, or --all)",
    usage: "git log [--oneline] [--all] [<branch>]",
    flags: [
      { name: "oneline", takesValue: false },
      { name: "all", takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 1,
  },
  branch: {
    name: "branch",
    summary: "List, create (at a start point) or delete branches",
    usage: "git branch [-d | -D] [<name> [<start-point>]]",
    flags: [
      { name: "d", aliases: ["delete"], takesValue: false },
      { name: "D", takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 2,
  },
  switch: {
    name: "switch",
    summary: "Switch branches (-c creates one, --detach visits a commit)",
    usage: "git switch [-c <new-branch>] [--detach] <branch | start-point>",
    flags: [
      { name: "c", aliases: ["create"], takesValue: true },
      { name: "detach", takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 1,
  },
  checkout: {
    name: "checkout",
    summary: "Older way to switch branches or visit a commit (prefer git switch)",
    usage: "git checkout [-b <new-branch>] <branch | commit>",
    flags: [{ name: "b", takesValue: true }],
    acceptsArguments: true,
    maxArguments: 1,
  },
  merge: {
    name: "merge",
    summary: "Join another branch into the current one",
    usage: "git merge [--no-ff | --ff-only] <branch>",
    flags: [
      { name: "no-ff", takesValue: false },
      { name: "ff-only", takesValue: false },
      { name: "abort", takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 1,
  },
  diff: {
    name: "diff",
    summary: "Show unstaged changes (--staged: staged ones)",
    usage: "git diff [--staged] [<path>...]",
    flags: [{ name: "staged", aliases: ["cached"], takesValue: false }],
    acceptsArguments: true,
  },
  restore: {
    name: "restore",
    summary: "Discard changes to files, or unstage them (--staged)",
    usage: "git restore [--staged] [--worktree] [--source <commit>] <path>...",
    flags: [
      { name: "staged", aliases: ["S"], takesValue: false },
      { name: "worktree", aliases: ["W"], takesValue: false },
      { name: "source", aliases: ["s"], takesValue: true },
    ],
    acceptsArguments: true,
  },
  rm: {
    name: "rm",
    summary: "Delete tracked files (--cached: just stop tracking)",
    usage: "git rm [--cached] [-r] [-f] <path>...",
    flags: [
      { name: "cached", takesValue: false },
      { name: "r", takesValue: false },
      { name: "f", aliases: ["force"], takesValue: false },
    ],
    acceptsArguments: true,
  },
  reset: {
    name: "reset",
    summary: "Move the branch back (--soft, --mixed, --hard), or unstage files",
    usage: "git reset [--soft | --mixed | --hard] [<commit>] [-- <path>...]",
    flags: [
      { name: "soft", takesValue: false },
      { name: "mixed", takesValue: false },
      { name: "hard", takesValue: false },
    ],
    acceptsArguments: true,
  },
  revert: {
    name: "revert",
    summary: "Undo a commit with a new commit",
    usage: "git revert <commit>",
    flags: [
      { name: "continue", takesValue: false },
      { name: "abort", takesValue: false },
      { name: "skip", takesValue: false },
      // Accepted for compatibility with tutorials; GitDojo never opens an editor anyway.
      { name: "no-edit", takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 1,
  },
  stash: {
    name: "stash",
    summary: "Shelve uncommitted work (list, apply, pop, drop, show)",
    usage: "git stash [push [-m <message>] [-u] | list | apply | pop | drop | show] [stash@{n}]",
    flags: [
      { name: "m", aliases: ["message"], takesValue: true },
      { name: "u", aliases: ["include-untracked"], takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 2,
  },
  "cherry-pick": {
    name: "cherry-pick",
    summary: "Copy a commit onto the current branch",
    usage: "git cherry-pick <commit>",
    flags: [
      { name: "continue", takesValue: false },
      { name: "abort", takesValue: false },
      { name: "skip", takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 1,
  },
  reflog: {
    name: "reflog",
    summary: "Show where HEAD has been (find lost commits)",
    usage: "git reflog [show] [<branch>]",
    flags: [],
    acceptsArguments: true,
    maxArguments: 2,
  },
  rebase: {
    name: "rebase",
    summary: "Replay your branch's commits on top of another",
    usage: "git rebase <upstream>",
    flags: [
      { name: "continue", takesValue: false },
      { name: "abort", takesValue: false },
      { name: "skip", takesValue: false },
      { name: "i", aliases: ["interactive"], takesValue: false },
    ],
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
  "clone",
  "config",
  "fetch",
  "mv",
  "pull",
  "push",
  "remote",
  "show",
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
