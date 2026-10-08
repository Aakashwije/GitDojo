import { GIT_COMMAND_SPECS, tokenize, type CommandErrorCode } from "@gitdojo/command-parser";
import { type GitEducationalError, type RepositoryState } from "@gitdojo/shared-types";
import { closestMatches } from "./suggest";

/** What happened when a command ran: everything the terminal knows. */
export interface ExplainInput {
  /** The command line as typed. */
  command: string;
  ok: boolean;
  /** Exactly what the terminal printed. */
  output: string;
  /** The engine's or parser's error code (`CommandExecutionResult.errorCode`). */
  errorCode?: string;
  /** Repository state after the command, so explanations can name the learner's files. */
  repository?: RepositoryState;
}

/** The educational codes GitDojo explains. */
export type EducationalCode =
  | "NOT_A_REPOSITORY"
  | "NOTHING_TO_COMMIT"
  | "UNKNOWN_BRANCH"
  | "UNSTAGED_CHANGES"
  | "MERGE_CONFLICT"
  | "DETACHED_HEAD"
  | "COMMITS_LEFT_BEHIND"
  | "NON_FAST_FORWARD"
  | "INVALID_COMMIT"
  | "BRANCH_ALREADY_EXISTS"
  | "PATH_NOT_FOUND"
  | "UNRESOLVED_CONFLICTS"
  | "OPERATION_IN_PROGRESS"
  | "NO_OPERATION"
  | "NO_COMMITS_YET"
  | "INVALID_BRANCH_NAME"
  | "BRANCH_NOT_MERGED"
  | "BRANCH_CHECKED_OUT"
  | "NO_STASH"
  | "EMPTY_COMMIT"
  | "UNMERGED_PATH"
  | "NOT_ON_BRANCH"
  | "COMMIT_MESSAGE_REQUIRED"
  | "NOTHING_SPECIFIED"
  | "COMMAND_NOT_FOUND"
  | "UNKNOWN_GIT_COMMAND"
  | "UNSUPPORTED_OPTION"
  | "MISSING_VALUE"
  | "TOO_MANY_ARGUMENTS"
  | "UNCLOSED_QUOTE";

interface Context {
  input: ExplainInput;
  /** The Git subcommand typed, e.g. `switch`; `null` for other programs. */
  gitCommand: string | null;
  /** Words after the subcommand, as tokenized. */
  args: string[];
  repository: RepositoryState | undefined;
}

type Explanation = Omit<GitEducationalError, "code" | "terminalMessage" | "severity"> & {
  severity?: GitEducationalError["severity"];
};

const LEARN = {
  init: { course: "git-basics", lesson: "git-init", title: "Initialize a Repository" },
  status: { course: "git-basics", lesson: "git-status", title: "Understanding git status" },
  staging: { course: "git-basics", lesson: "staging-area", title: "Staging Area" },
  commit: { course: "git-basics", lesson: "git-commit", title: "Create Your First Commit" },
  log: { course: "git-basics", lesson: "git-log", title: "Understanding Commit History" },
  branch: { course: "branching", lesson: "git-branch", title: "Create Your First Branch" },
  switch: { course: "branching", lesson: "git-switch", title: "Switch Between Branches" },
  head: { course: "branching", lesson: "understanding-head", title: "Understanding HEAD" },
  merge: { course: "merging", lesson: "what-is-merging", title: "What is Merging?" },
  fastForward: { course: "merging", lesson: "fast-forward-merge", title: "Fast-Forward Merge" },
  conflicts: {
    course: "merge-conflicts",
    lesson: "why-conflicts-happen",
    title: "Why Conflicts Happen",
  },
  markers: {
    course: "merge-conflicts",
    lesson: "reading-conflict-markers",
    title: "Reading Conflict Markers",
  },
  restore: {
    course: "recovery",
    lesson: "git-restore",
    title: "Discard and Unstage with git restore",
  },
  stash: { course: "recovery", lesson: "git-stash", title: "Shelve Work with git stash" },
  reflog: {
    course: "recovery",
    lesson: "git-reflog",
    title: "Recover Lost Commits with git reflog",
  },
  cherryPick: {
    course: "recovery",
    lesson: "git-cherry-pick",
    title: "Copy a Commit with git cherry-pick",
  },
  rebase: { course: "recovery", lesson: "git-rebase", title: "Replay Work with git rebase" },
} as const;

/** The first `'quoted'` name in Git's message, e.g. the branch in `branch 'x' not found`. */
function quoted(output: string): string | null {
  return /'([^']+)'/.exec(output)?.[1] ?? null;
}

function branchNames(repository: RepositoryState | undefined): string[] {
  return (repository?.branches ?? []).filter((b) => b.oid !== null).map((b) => b.name);
}

function list(names: readonly string[]): string {
  return names.map((name) => `\`${name}\``).join(", ");
}

function didYouMean(typed: string | null | undefined, candidates: Iterable<string>): string[] {
  if (!typed) return [];
  const matches = closestMatches(typed, candidates);
  return matches.length === 0 ? [] : [`Did you mean ${list(matches)}?`];
}

const OPERATION_WORDS: Record<string, string> = {
  merge: "merge",
  revert: "revert",
  "cherry-pick": "cherry-pick",
  rebase: "rebase",
  stash: "stash",
};

const EXPLANATIONS: Record<EducationalCode, (ctx: Context) => Explanation> = {
  NOT_A_REPOSITORY: () => ({
    title: "This folder is not a Git repository yet",
    explanation:
      "Git keeps a repository's history in a hidden `.git` folder. There is none here, so Git has nothing to work with.",
    concept: "repositories",
    possibleCauses: ["`git init` has not been run in this folder yet."],
    hints: ["Run `git init` to turn this folder into a repository."],
    learnMore: LEARN.init,
  }),

  NOTHING_TO_COMMIT: ({ repository }) => {
    const untracked = repository?.files.filter((f) => f.status === "untracked") ?? [];
    const modified = repository?.files.filter((f) => f.status === "modified") ?? [];
    const causes: string[] = [];
    if (modified.length > 0) {
      causes.push(`You changed ${list(modified.map((f) => f.path))} but did not stage it.`);
    }
    if (untracked.length > 0) {
      causes.push(
        `${list(untracked.map((f) => f.path))} ${untracked.length === 1 ? "is" : "are"} untracked: Git is not including ${untracked.length === 1 ? "it" : "them"} yet.`,
      );
    }
    if (causes.length === 0)
      causes.push("Everything is already committed. There is simply nothing new.");
    return {
      title: "The staging area is empty",
      explanation:
        "A commit records what is in the staging area, not every file you changed. Right now nothing is staged, so there is nothing to record.",
      concept: "staging",
      possibleCauses: causes,
      hints: ["Stage changes with `git add <file>` (or `git add .`), then commit again."],
      learnMore: LEARN.staging,
    };
  },

  UNKNOWN_BRANCH: ({ input, args, repository }) => {
    const names = branchNames(repository);
    const typed =
      /invalid reference: (\S+)/.exec(input.output)?.[1] ??
      quoted(input.output) ??
      args.find((arg) => !arg.startsWith("-"));
    if (input.output.includes("a branch is expected, got commit")) {
      return {
        title: "That is a commit, not a branch",
        explanation:
          '`git switch` moves between branches. Visiting a single commit means leaving every branch behind (a "detached HEAD"), so Git wants you to ask for that explicitly.',
        concept: "head",
        possibleCauses: [`\`${typed ?? "that"}\` names a commit, not a branch.`],
        hints: [
          `To look around at that commit, run \`git switch --detach ${typed ?? "<commit>"}\`.`,
          "To work from there, create a branch at it: `git switch -c <new-branch> <commit>`.",
        ],
        learnMore: LEARN.head,
      };
    }
    return {
      title: "There is no branch with that name",
      explanation:
        "Git can only switch to, merge or delete branches that exist in this repository.",
      concept: "branches",
      possibleCauses: [
        ...didYouMean(typed, names),
        names.length > 0
          ? `This repository's branches are ${list(names)}.`
          : "This repository has no branches yet: a branch exists only after its first commit.",
        "Branch names are case-sensitive, and `/` is part of the name (`feature/login`).",
      ],
      hints: ["Run `git branch` to list branches, or `git switch -c <name>` to create one."],
      learnMore: LEARN.switch,
    };
  },

  UNSTAGED_CHANGES: ({ input, gitCommand }) => {
    const files = [...input.output.matchAll(/^\t(.+)$/gm)].map((match) => match[1] ?? "");
    const operation =
      gitCommand === "switch" || gitCommand === "checkout"
        ? "switching branches"
        : `this ${OPERATION_WORDS[gitCommand ?? ""] ?? "command"}`;
    return {
      title: "Uncommitted changes are in the way",
      explanation: `Git refused because ${operation} would overwrite work that is not saved in any commit. Git never throws away uncommitted work without being told to.`,
      concept: "working-tree",
      possibleCauses: [
        files.length > 0
          ? `${list(files)} ${files.length === 1 ? "has" : "have"} changes that would be lost.`
          : "Some files have changes that would be lost.",
      ],
      hints: [
        "Commit the changes if they are ready: `git add` then `git commit`.",
        "Not ready? Put them aside with `git stash`, and bring them back later with `git stash pop`.",
        "Don't want them? Discard them with `git restore <file>`.",
      ],
      learnMore: LEARN.stash,
    };
  },

  MERGE_CONFLICT: ({ input, gitCommand, repository }) => {
    const files =
      repository?.conflicts.filter((c) => !c.resolved).map((c) => c.path) ??
      [...input.output.matchAll(/Merge conflict in (.+)$/gm)].map((m) => m[1] ?? "");
    const operation = OPERATION_WORDS[gitCommand ?? ""] ?? "merge";
    const finish =
      operation === "merge"
        ? "`git commit`"
        : operation === "stash"
          ? "nothing more: the stash entry is kept until you drop it"
          : `\`git ${operation} --continue\``;
    return {
      title: "Both sides changed the same lines",
      explanation: `The ${operation} combined everything it could, but some lines were changed in two different ways. Git cannot know which version is right, so it marked the spot with \`<<<<<<<\`, \`=======\` and \`>>>>>>>\` and stopped for you to decide.`,
      concept: "merge-conflicts",
      possibleCauses: files.length > 0 ? [`In conflict: ${list(files)}.`] : [],
      hints: [
        "Open each conflicted file, keep the lines you want and delete every marker line.",
        "Mark each file as resolved with `git add <file>`.",
        `Then finish with ${finish}${operation === "stash" ? "." : ` (or give up with \`git ${operation} --abort\`).`}`,
      ],
      learnMore: LEARN.markers,
    };
  },

  DETACHED_HEAD: ({ repository }) => ({
    severity: "notice",
    title: 'You are in "detached HEAD" state',
    explanation:
      "HEAD now points straight at a commit instead of at a branch. You can look around and even commit, but no branch moves forward with you: commits made here are easy to lose when you switch away.",
    concept: "head",
    possibleCauses: [
      `HEAD is at ${repository?.head?.slice(0, 7) ?? "a commit"}, not on any branch.`,
    ],
    hints: [
      "To keep working here, create a branch: `git switch -c <new-branch>`.",
      "To go back, switch to a branch: `git switch main` (or `git switch -`).",
    ],
    learnMore: LEARN.head,
  }),

  COMMITS_LEFT_BEHIND: ({ input }) => {
    const oid = /git branch <new-branch-name> ([0-9a-f]+)/.exec(input.output)?.[1];
    return {
      severity: "notice",
      title: "Some commits are no longer on any branch",
      explanation:
        "You left a detached HEAD that had commits of its own. No branch points at them now, so `git log` and the graph no longer show them. They are not deleted (yet): the reflog remembers them.",
      concept: "reflog",
      hints: [
        oid
          ? `Keep them by creating a branch: \`git branch <new-branch-name> ${oid}\`.`
          : "Keep them by creating a branch at the commit Git printed.",
        "Lost the id? `git reflog` lists every place HEAD has been.",
      ],
      learnMore: LEARN.reflog,
    };
  },

  NON_FAST_FORWARD: () => ({
    title: "This is not a fast-forward",
    explanation:
      "A fast-forward simply moves the branch label ahead. That only works when your branch has no commits of its own; here both branches have moved on since they split.",
    concept: "merging",
    possibleCauses: ["Both branches have commits the other does not have."],
    hints: [
      "Merge without `--ff-only` to create a merge commit.",
      "Or replay your commits on top of the other branch with `git rebase`.",
    ],
    learnMore: LEARN.fastForward,
  }),

  INVALID_COMMIT: ({ input, args, repository }) => {
    const typed = quoted(input.output) ?? /reference: (\S+)/.exec(input.output)?.[1] ?? args.at(-1);
    const commits = repository?.allCommits.length ?? 0;
    return {
      title: "Git cannot find that commit",
      explanation:
        "Commands like this one need a commit: a branch name, `HEAD`, `HEAD~1` (one before HEAD), `HEAD@{2}` (where HEAD was two moves ago) or a commit id.",
      concept: "history",
      possibleCauses: [
        ...didYouMean(typed, branchNames(repository)),
        typed?.match(/~(\d+)/) && commits > 0
          ? `\`${typed}\` goes back further than the history does (${String(commits)} commit${commits === 1 ? "" : "s"}).`
          : `\`${typed ?? "That"}\` is not a branch or a commit id in this repository.`,
      ],
      hints: [
        "`git log --oneline` lists commits with their ids; `git reflog` also lists ones no branch holds.",
      ],
      learnMore: LEARN.log,
    };
  },

  BRANCH_ALREADY_EXISTS: ({ input }) => {
    const name = quoted(input.output);
    const clash = /a branch named '([^']+)' already exists$/.exec(
      input.output.split("\n")[0] ?? "",
    )?.[1];
    return {
      title: "A branch with that name already exists",
      explanation: "Every branch needs its own name, so Git will not create a second one.",
      concept: "branches",
      possibleCauses: [
        input.output.includes("cannot create branch")
          ? `\`${name ?? ""}\` would clash with the existing \`${clash ?? ""}\`: Git stores branches as files, so \`x\` and \`x/y\` cannot both exist.`
          : `\`${name ?? "That branch"}\` is already there.`,
      ],
      hints: [
        `To use it, switch to it: \`git switch ${name ?? "<branch>"}\`.`,
        "Otherwise pick another name.",
      ],
      learnMore: LEARN.branch,
    };
  },

  PATH_NOT_FOUND: ({ input, args, repository }) => {
    const typed = quoted(input.output) ?? args.find((arg) => !arg.startsWith("-"));
    const paths = repository?.files.map((f) => f.path) ?? [];
    return {
      title: "No file matches that path",
      explanation: "Git looked for that file or folder in the project and found nothing to act on.",
      concept: "working-tree",
      possibleCauses: [
        ...didYouMean(typed, paths),
        "Paths are case-sensitive and relative to the project root, e.g. `src/app.js`.",
        "Commands like `git restore` only know files Git already tracks.",
      ],
      hints: ["Run `git status` to see the files Git knows about."],
      learnMore: LEARN.status,
    };
  },

  UNRESOLVED_CONFLICTS: ({ repository }) => {
    const open = repository?.conflicts.filter((c) => !c.resolved).map((c) => c.path) ?? [];
    return {
      title: "Some conflicts are not resolved yet",
      explanation:
        "A conflicted file counts as resolved once you have removed its markers and staged it with `git add`. Until every one is, Git will not record the result.",
      concept: "merge-conflicts",
      possibleCauses: open.length > 0 ? [`Still in conflict: ${list(open)}.`] : [],
      hints: ["Edit each file, delete the marker lines, then `git add <file>`."],
      learnMore: LEARN.markers,
    };
  },

  OPERATION_IN_PROGRESS: ({ repository }) => {
    const kind = repository?.merge?.kind ?? "merge";
    return {
      title: `A ${kind} is still in progress`,
      explanation: `The ${kind} stopped for conflicts and is waiting for you. Git does one thing at a time, so it must be finished or cancelled before most other commands.`,
      concept: "merge-conflicts",
      hints: [
        kind === "merge"
          ? "Resolve and `git add` the conflicted files, then `git commit`."
          : `Resolve and \`git add\` the conflicted files, then \`git ${kind} --continue\`.`,
        `Or cancel it with \`git ${kind} --abort\`.`,
      ],
      learnMore: LEARN.conflicts,
    };
  },

  NO_OPERATION: ({ gitCommand }) => ({
    title: "There is nothing to continue or abort",
    explanation: `\`--continue\`, \`--abort\` and \`--skip\` only apply while a ${gitCommand ?? "merge"} is stopped for conflicts. Right now nothing is in progress.`,
    concept: "merge-conflicts",
    hints: ["Run `git status` to see what state the repository is in."],
    learnMore: LEARN.status,
  }),

  NO_COMMITS_YET: ({ repository }) => ({
    title: "There are no commits yet",
    explanation:
      "This command needs at least one commit to work with, and this branch has none. A new repository starts empty until the first `git commit`.",
    concept: "commits",
    possibleCauses: [`\`${repository?.currentBranch ?? "main"}\` has no commits.`],
    hints: [
      'Stage something with `git add`, then make your first commit with `git commit -m "..."`.',
    ],
    learnMore: LEARN.commit,
  }),

  INVALID_BRANCH_NAME: ({ input }) => ({
    title: "Git does not accept that branch name",
    explanation:
      "Branch names cannot contain spaces, `..`, `~`, `^`, `:`, `?`, `*` or `[`, and cannot start with `-` or end with `/` or `.`.",
    concept: "branches",
    possibleCauses: [`\`${quoted(input.output) ?? "That name"}\` breaks one of those rules.`],
    hints: ["Use letters, digits, `-` and `/`, like `feature/login`."],
    learnMore: LEARN.branch,
  }),

  BRANCH_NOT_MERGED: ({ input }) => {
    const name = quoted(input.output) ?? "that branch";
    return {
      title: "That branch has work nowhere else",
      explanation: `\`git branch -d\` only deletes branches whose commits are already in your current branch. \`${name}\` has commits that would be left on no branch at all.`,
      concept: "branches",
      hints: [
        `Merge it first (\`git merge ${name}\`) if the work matters.`,
        `Sure it doesn't? \`git branch -D ${name}\` deletes it anyway (the reflog can still find the commits for a while).`,
      ],
      learnMore: LEARN.merge,
    };
  },

  BRANCH_CHECKED_OUT: ({ input }) => ({
    title: "You cannot delete the branch you are on",
    explanation: "HEAD points at this branch. Deleting it would leave HEAD pointing at nothing.",
    concept: "head",
    hints: [`Switch to another branch first, then delete \`${quoted(input.output) ?? "it"}\`.`],
    learnMore: LEARN.head,
  }),

  NO_STASH: ({ input }) => ({
    title: input.output.includes("not a valid reference")
      ? "There is no stash entry with that number"
      : "The stash is empty",
    explanation:
      "The stash holds work you set aside with `git stash`. Entries are numbered from `stash@{0}`, the newest.",
    concept: "stash",
    hints: ["Run `git stash list` to see what is in the stash."],
    learnMore: LEARN.stash,
  }),

  EMPTY_COMMIT: ({ gitCommand }) => ({
    title: "That would change nothing",
    explanation: `The ${OPERATION_WORDS[gitCommand ?? ""] ?? "change"} you asked for is already reflected in your files, so there is nothing to record as a new commit.`,
    concept: "history",
    possibleCauses: [
      "The commit's changes are already on this branch (perhaps picked or reverted before).",
    ],
    hints: ["Run `git log --oneline` to check what this branch already contains."],
    learnMore: LEARN.cherryPick,
  }),

  UNMERGED_PATH: ({ input }) => ({
    title: "That file is still in conflict",
    explanation:
      'While a file is in conflict Git does not know which version is "the" version, so it cannot restore it.',
    concept: "merge-conflicts",
    hints: [
      `Resolve \`${quoted(input.output) ?? "the file"}\` and \`git add\` it, or abort the whole operation (e.g. \`git merge --abort\`).`,
    ],
    learnMore: LEARN.markers,
  }),

  NOT_ON_BRANCH: () => ({
    title: "Rebasing needs a branch",
    explanation:
      "A rebase moves a branch onto a new base. HEAD is detached, so there is no branch to move.",
    concept: "head",
    hints: ["Create or switch to a branch first: `git switch -c <name>` or `git switch <branch>`."],
    learnMore: LEARN.rebase,
  }),

  COMMIT_MESSAGE_REQUIRED: () => ({
    title: "A commit needs a message",
    explanation:
      "Every commit has a short message saying what changed and why. GitDojo's terminal has no text editor to write one in, so give it with `-m`.",
    concept: "commits",
    hints: ['Run `git commit -m "Describe your change"`.'],
    learnMore: LEARN.commit,
  }),

  NOTHING_SPECIFIED: ({ gitCommand }) => ({
    title: "Which files?",
    explanation: `\`git ${gitCommand ?? "add"}\` needs to know which files to act on.`,
    concept: "staging",
    hints: [`Name a file (\`git ${gitCommand ?? "add"} README.md\`) or use \`.\` for everything.`],
    learnMore: LEARN.staging,
  }),

  COMMAND_NOT_FOUND: ({ input }) => {
    const program = input.command.trim().split(/\s+/)[0] ?? "";
    const shell: Record<string, string> = {
      ls: "The Files panel and the editor's explorer show every file.",
      cat: "Open the file in the Editor tab to read it.",
      touch: "Create files with the New file button in the editor's explorer.",
      rm: "Delete files from the editor's explorer, or use `git rm` for tracked files.",
      cd: "The terminal always works in the project folder; there is nowhere else to go.",
      mkdir: "Create a file inside the new folder (e.g. `docs/notes.md`) from the editor.",
      echo: "Edit files in the Editor tab instead.",
      vim: "Edit files in the Editor tab.",
      nano: "Edit files in the Editor tab.",
      code: "Edit files in the Editor tab.",
    };
    return {
      title: "This terminal only runs Git",
      explanation:
        "GitDojo's terminal is a safe sandbox: it understands Git commands (plus `help` and `clear`), not a full shell.",
      concept: "sandbox",
      possibleCauses: [`\`${program}\` is a shell command, not a Git command.`],
      hints: [
        shell[program] ?? "Type `help` to see every command you can use.",
        ...(program === "gti" || program === "gut" ? ["Did you mean `git`?"] : []),
      ],
    };
  },

  UNKNOWN_GIT_COMMAND: ({ input, gitCommand }) => {
    const planned = input.output.includes("not available in GitDojo yet");
    return {
      title: planned
        ? "GitDojo does not support that command yet"
        : "Git does not have that command",
      explanation: planned
        ? "It is a real Git command, but this sandbox does not implement it (yet)."
        : "Git did not recognize that subcommand.",
      concept: "commands",
      possibleCauses: planned ? [] : didYouMean(gitCommand, Object.keys(GIT_COMMAND_SPECS)),
      hints: ["Type `help` to see every command GitDojo supports."],
    };
  },

  UNSUPPORTED_OPTION: ({ input, gitCommand }) => {
    const option = quoted(input.output);
    return {
      title: "That option is not supported here",
      explanation: `GitDojo supports the options of \`git ${gitCommand ?? ""}\` that learners need most; \`${option ?? "this one"}\` is not one of them, or it is misspelled.`,
      concept: "commands",
      hints: ["The `usage:` line in the output lists the options you can use."],
    };
  },

  MISSING_VALUE: ({ input }) => ({
    title: "That option needs a value",
    explanation: `\`${quoted(input.output) ?? "The option"}\` must be followed by a value, like \`-m "message"\` or \`-c new-branch\`.`,
    concept: "commands",
    hints: [
      'Put the value right after the option, in quotes if it has spaces: `git commit -m "Fix login"`.',
    ],
  }),

  TOO_MANY_ARGUMENTS: ({ input }) => ({
    title: "Too many words for this command",
    explanation: `Git was not expecting \`${quoted(input.output) ?? "the extra word"}\`.`,
    concept: "commands",
    possibleCauses: [
      'A message or name with spaces needs quotes: `git commit -m "Add login form"`.',
    ],
    hints: ["The `usage:` line in the output shows what the command accepts."],
  }),

  UNCLOSED_QUOTE: () => ({
    title: "A quote was never closed",
    explanation: "Text in quotes must end with the same kind of quote it started with.",
    concept: "commands",
    hints: ['Close the quote: `git commit -m "Add login form"`.'],
  }),
};

type ErrorMapping = EducationalCode | ((output: string) => EducationalCode | null) | null;

/**
 * Which explanation each engine or parser error code gets: one entry per code, so a new code
 * does not compile until it is given an explanation (or `null`, for "nothing to add").
 */
const ERROR_CODE_EXPLANATIONS: Record<CommandErrorCode, ErrorMapping> = {
  NOT_A_REPOSITORY: "NOT_A_REPOSITORY",
  NOTHING_TO_COMMIT: "NOTHING_TO_COMMIT",
  BRANCH_NOT_FOUND: "UNKNOWN_BRANCH",
  CHECKOUT_CONFLICT: "UNSTAGED_CHANGES",
  LOCAL_CHANGES: "UNSTAGED_CHANGES",
  MERGE_CONFLICT: "MERGE_CONFLICT",
  NOT_FAST_FORWARD: "NON_FAST_FORWARD",
  INVALID_REVISION: "INVALID_COMMIT",
  BRANCH_EXISTS: "BRANCH_ALREADY_EXISTS",
  FILE_NOT_FOUND: "PATH_NOT_FOUND",
  UNRESOLVED_CONFLICTS: "UNRESOLVED_CONFLICTS",
  MERGE_IN_PROGRESS: "OPERATION_IN_PROGRESS",
  OPERATION_IN_PROGRESS: "OPERATION_IN_PROGRESS",
  NO_MERGE: "NO_OPERATION",
  NO_OPERATION: "NO_OPERATION",
  NO_COMMITS: "NO_COMMITS_YET",
  INVALID_BRANCH_NAME: "INVALID_BRANCH_NAME",
  BRANCH_NOT_MERGED: "BRANCH_NOT_MERGED",
  BRANCH_CHECKED_OUT: "BRANCH_CHECKED_OUT",
  NO_STASH: "NO_STASH",
  EMPTY_COMMIT: "EMPTY_COMMIT",
  UNMERGED_PATH: "UNMERGED_PATH",
  NOT_ON_BRANCH: "NOT_ON_BRANCH",
  // One engine code for many argument problems: the output says which.
  INVALID_ARGUMENT: (output) => {
    if (output.includes("commit message is required")) return "COMMIT_MESSAGE_REQUIRED";
    if (output.startsWith("Nothing specified") || output.includes("you must specify path")) {
      return "NOTHING_SPECIFIED";
    }
    if (output.includes("is outside repository")) return "PATH_NOT_FOUND";
    return null;
  },
  UNSUPPORTED_PROGRAM: "COMMAND_NOT_FOUND",
  UNSUPPORTED_GIT_COMMAND: "UNKNOWN_GIT_COMMAND",
  UNKNOWN_FLAG: "UNSUPPORTED_OPTION",
  MISSING_FLAG_VALUE: "MISSING_VALUE",
  UNEXPECTED_ARGUMENT: "TOO_MANY_ARGUMENTS",
  MALFORMED_QUOTES: "UNCLOSED_QUOTE",
  EMPTY_COMMAND: null,
  MISSING_GIT_COMMAND: null,
  MISSING_REQUIRED_FLAG: null,
  UNKNOWN: null,
  INTERNAL: null,
};

function isCommandErrorCode(code: string | undefined): code is CommandErrorCode {
  return code !== undefined && Object.hasOwn(ERROR_CODE_EXPLANATIONS, code);
}

/** Maps an engine or parser error code (plus the output) to the explanation to show. */
function educationalCode({ errorCode, output }: ExplainInput): EducationalCode | null {
  if (!isCommandErrorCode(errorCode)) return null;
  const mapping = ERROR_CODE_EXPLANATIONS[errorCode];
  return typeof mapping === "function" ? mapping(output) : mapping;
}

/** Notices for commands that worked but deserve a word, e.g. entering a detached HEAD. */
function noticeCode(input: ExplainInput, gitCommand: string | null): EducationalCode | null {
  if (input.output.includes("Warning: you are leaving")) return "COMMITS_LEFT_BEHIND";
  const moved = gitCommand === "switch" || gitCommand === "checkout";
  if (
    moved &&
    input.repository?.initialized &&
    input.repository.currentBranch === null &&
    input.repository.head !== null &&
    input.repository.merge === null
  ) {
    return "DETACHED_HEAD";
  }
  return null;
}

function contextFor(input: ExplainInput): Context {
  const tokenized = tokenize(input.command);
  const words = tokenized.ok ? tokenized.tokens : input.command.trim().split(/\s+/);
  const gitCommand = words[0] === "git" ? (words[1] ?? null) : null;
  return {
    input,
    gitCommand,
    args: gitCommand === null ? words.slice(1) : words.slice(2),
    repository: input.repository,
  };
}

/**
 * Explains a command's outcome for learners, or returns `null` when there is nothing to add
 * (most successful commands, and internal failures). The terminal keeps printing Git's real
 * message; this is shown next to it.
 */
export function explainCommand(input: ExplainInput): GitEducationalError | null {
  const context = contextFor(input);
  const code = input.ok ? noticeCode(input, context.gitCommand) : educationalCode(input);
  if (code === null) return null;
  const { severity, possibleCauses, ...explanation } = EXPLANATIONS[code](context);
  return {
    code,
    severity: severity ?? (input.ok ? "notice" : "error"),
    terminalMessage: input.output,
    ...explanation,
    ...(possibleCauses && possibleCauses.length > 0 ? { possibleCauses } : {}),
  };
}

/** Every educational code, e.g. for documentation and tests. */
export const EDUCATIONAL_CODES = Object.keys(EXPLANATIONS) as EducationalCode[];
