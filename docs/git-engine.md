# Git engine

`@gitdojo/git-engine` is the only package that talks to isomorphic-git and LightningFS. The rest of
GitDojo uses two interfaces from it: `VirtualFileSystem` and `GitEngine`.

## Virtual filesystem

```ts
import { createLightningFs, WorkspaceFileSystem } from "@gitdojo/git-engine";

const fs = createLightningFs("gitdojo"); // IndexedDB database name
const files = new WorkspaceFileSystem(fs);

await files.createWorkspace("lesson-first-commit");
await files.writeFile("lesson-first-commit", "README.md", "# Hello\n");
await files.listFiles("lesson-first-commit"); // recursive, sorted, excludes .git
await files.resetWorkspace("lesson-first-commit"); // empties the workspace, including .git
```

All workspaces share one database. Each lives at `/gitdojo/<workspace-id>/`.

Paths are workspace-relative. `normalizeWorkspacePath` turns `./src//index.ts` into
`src/index.ts`, treats a leading `/` as the workspace root, and **rejects** any path that contains
`..`, a backslash or a null byte (it throws `UnsafePathError`). Mutating calls also refuse to touch
the workspace root itself or anything inside `.git`.

`writeFile` replaces an existing file with one that has a new inode instead of overwriting it in
place, so Git notices even a same-size edit within the same second (see
[Racy Git and inodes](#racy-git-and-inodes)).

## GitEngine

```ts
import { createGitEngine } from "@gitdojo/git-engine";

const git = createGitEngine({ fs, workspaceId: "lesson-first-commit" });

await git.init();
await git.status();
await git.add(["README.md"]); // or ["."]
await git.commit({ message: "Initial commit" }); // author defaults to GitDojo Learner
await git.log({ oneline: true }); // also { revision: "feature" } and { all: true }
await git.showBranches(); // `git branch`
await git.createBranch("feature/login"); // `git branch feature/login [<start-point>]`
await git.deleteBranch("old", { force: false }); // `git branch -d old` (-D with force)
await git.switchBranch("feature/login"); // `git switch feature/login`, `git switch -`
await git.createAndSwitchBranch("bugfix", "main~1"); // `git switch -c bugfix [<start-point>]`
await git.detachHead("HEAD~1", { advice: false }); // `git switch --detach HEAD~1`
await git.listBranches(); // BranchState[] as data, no output
await git.merge("feature/login"); // fast-forward or merge commit; { noFastForward, fastForwardOnly }
await git.abortMerge(); // `git merge --abort`

await git.diff({ staged: false, paths: [] }); // `git diff [--staged] [<path>...]`
await git.restore(["a.txt"], { staged: true }); // `git restore [--staged] [--source <rev>] <path>`
await git.rm(["a.txt"], { cached: true }); // `git rm [--cached] [-r] [-f] <path>`
await git.reset({ mode: "hard", commit: "HEAD~1" }); // `git reset --hard HEAD~1`
await git.reset({ paths: ["a.txt"] }); // `git reset a.txt` (unstage)
await git.revert("HEAD"); // `git revert HEAD`
await git.cherryPick("feature~1"); // `git cherry-pick feature~1`
await git.sequencer("revert", "continue"); // `git revert --continue | --abort | --skip`
await git.stashPush({ message: "wip", includeUntracked: false }); // `git stash push -m wip`
await git.stashList(); // `git stash list`
await git.stashApply("stash@{0}", { pop: true }); // `git stash pop`
await git.stashDrop(); // `git stash drop`
await git.stashShow(); // `git stash show`
await git.reflog("HEAD"); // `git reflog [show] [<branch>]`
await git.rebase("main"); // `git rebase main`
await git.rebaseControl("continue"); // `git rebase --continue | --skip | --abort`

await git.snapshot(); // read-only view used by @gitdojo/repository-state
```

An engine is bound to one workspace. Command methods **never reject**. They return:

```ts
interface GitCommandResult<T> {
  ok: boolean;
  output: string; // Git-like terminal output ("" for silent commands such as add)
  data?: T; // normalized, engine-neutral data
  error?: GitEngineError; // { code, message, cause? }
}
```

Unexpected exceptions become `{ code: "UNKNOWN" }` with a generic message. The original error is
kept in `cause` for debugging and is never rendered.

### Error codes

| Code                    | When                                                     | Output                                                                 |
| ----------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `NOT_A_REPOSITORY`      | Any command except `init` before `git init`              | `fatal: not a git repository (or any of the parent directories): .git` |
| `NOTHING_TO_COMMIT`     | `commit` with nothing staged                             | The `git status` report, e.g. `nothing to commit, working tree clean`  |
| `NO_COMMITS`            | `log` on an unborn branch                                | `fatal: your current branch 'main' does not have any commits yet`      |
| `FILE_NOT_FOUND`        | `add` with a pathspec that matches nothing               | `fatal: pathspec 'x' did not match any files`                          |
| `INVALID_ARGUMENT`      | Empty commit message, no pathspec, path outside repo     | e.g. `error: commit message is required`                               |
| `INVALID_BRANCH_NAME`   | A name Git's `check-ref-format` rules reject             | `fatal: 'a..b' is not a valid branch name`                             |
| `BRANCH_EXISTS`         | Creating a branch that exists (or clashes with `x/y`)    | `fatal: a branch named 'main' already exists`                          |
| `BRANCH_NOT_FOUND`      | Switching to a branch that does not exist                | `fatal: invalid reference: x`                                          |
| `CHECKOUT_CONFLICT`     | Switching or merging would overwrite uncommitted work    | Git's `Your local changes ... would be overwritten by ...` report      |
| `MERGE_CONFLICT`        | `merge` stopped with conflicts (`data.type: "conflict"`) | `CONFLICT (content): Merge conflict in x` and the failure summary      |
| `MERGE_IN_PROGRESS`     | `merge` or `switch` while a merge is unfinished          | `fatal: You have not concluded your merge (MERGE_HEAD exists).`        |
| `UNRESOLVED_CONFLICTS`  | `commit` while conflicts remain                          | `error: Committing is not possible because you have unmerged files.`   |
| `NO_MERGE`              | `merge --abort` with no merge in progress                | `fatal: There is no merge to abort (MERGE_HEAD missing).`              |
| `NOT_FAST_FORWARD`      | `merge --ff-only` when the branches have diverged        | `fatal: Not possible to fast-forward, aborting.`                       |
| `INVALID_REVISION`      | A commit-ish that names no commit                        | e.g. `fatal: bad revision 'x'`, `fatal: invalid reference: x`          |
| `BRANCH_CHECKED_OUT`    | `branch -d` on the current branch                        | `error: cannot delete branch 'main' used by worktree at ...`           |
| `BRANCH_NOT_MERGED`     | `branch -d` on a branch with unmerged commits            | `error: the branch 'x' is not fully merged.`                           |
| `OPERATION_IN_PROGRESS` | Starting a revert, cherry-pick, rebase... mid-operation  | e.g. `error: a cherry-pick is already in progress`                     |
| `NO_OPERATION`          | `--continue` / `--abort` with nothing in progress        | e.g. `fatal: No rebase in progress?`                                   |
| `LOCAL_CHANGES`         | Uncommitted work in the way (pick, stash apply, rebase)  | e.g. `error: your local changes would be overwritten by revert.`       |
| `UNMERGED_PATH`         | `restore` on a file that is still in conflict            | `error: path 'x' is unmerged`                                          |
| `NO_STASH`              | `stash apply/pop/drop/show` with no or a bad entry       | `No stash entries found.`                                              |
| `NOT_ON_BRANCH`         | `rebase` on a detached HEAD                              | `fatal: You are not currently on a branch.`                            |
| `EMPTY_COMMIT`          | A cherry-pick or revert that would change nothing        | `nothing to commit, working tree clean` and why                        |
| `UNKNOWN`               | Unexpected internal failure                              | Generic message                                                        |

### Behavior notes

- `init` uses `main` as the default branch. Running it twice prints
  `Reinitialized existing Git repository` and keeps history.
- `add` validates every pathspec before changing the index, so a typo stages nothing. A pathspec
  also stages deletions under it, like modern Git (`git add .` records removed files).
- `status` mirrors Git's long format, including its hints.
- `commit` prints `[main (root-commit) abc1234] message`, the number of files changed, and
  `create mode` / `delete mode` lines.
- `log` shows decorations (`HEAD -> main`) and supports `--oneline`. Dates use the author's
  recorded timezone.
- `git branch` lists branches sorted by name with `*` on the current one. An unborn branch is not
  listed (it does not exist until its first commit), but `listBranches()` and the snapshot still
  report it so the UI can show it. Creating a branch before the first commit fails with
  `fatal: not a valid object name: 'main'`, like Git.
- `switch` only touches paths whose committed content differs between the two branch tips;
  everything else, including uncommitted work, carries over, as in Git. If a path that would change
  has local modifications, or an untracked file would be overwritten, it refuses with Git's
  message and changes nothing. Emptied directories are removed.
- `switch -c` on an unborn branch just repoints HEAD, so the first commit lands on the new name.
- `git checkout <branch>`, `git checkout -b <name> [<start>]` and `git checkout <commit>` are
  routed to the same methods for comparison with older tutorials; an unknown name is reported as
  a pathspec, as Git does. Lessons teach `git switch`.
- The snapshot's `allCommits` holds every commit reachable from any branch or HEAD, children before
  parents, so the graph can show branches you are not on.

### Merging

GitDojo implements `merge` itself on top of isomorphic-git's object, tree and merge-base
functions, so conflicts are deterministic and behave like Git's:

- **Up to date / fast-forward.** If the other branch is already contained, it prints
  `Already up to date.`. If the current branch has no commits of its own, the branch label moves
  forward (`Updating a..b` / `Fast-forward` plus a diffstat) and no commit is created, unless
  `--no-ff` is given.
- **Three-way merge.** Each path is compared across the merge base, ours and theirs. A path changed
  on one side takes that side; a path changed on both is merged line by line with diff3
  (`src/engine/text-merge.ts`). Like Git, edits must be separated by an unchanged line to merge
  cleanly. Without conflicts, a merge commit with two parents is created
  (`Merge made by the 'ort' strategy.`, message `Merge branch 'x'`).
- **Conflicts.** Conflicted files get Git's markers (`<<<<<<< HEAD` / `=======` /
  `>>>>>>> branch`); cleanly merged files are staged; HEAD does not move. The engine writes
  `.git/MERGE_HEAD`, `.git/MERGE_MSG` and `.git/GITDOJO_MERGE.json` (the conflict record, since
  isomorphic-git's index has no conflict stages). Modify/delete and add/add conflicts are reported
  too.
- **Resolving.** `git add <file>` marks a conflict resolved, but only once its marker lines are
  gone. Real Git accepts markers; GitDojo warns and keeps the conflict open, so markers never
  reach a commit. `git status` shows `Unmerged paths` / `All conflicts fixed but you are still
merging`. `git commit` refuses while conflicts remain, then creates the merge commit; `-m` is
  optional during a merge (the prepared message is used).
- **Aborting.** `git merge --abort` restores every path the merge touched to HEAD's version.
- Merging refuses to overwrite uncommitted changes to paths it would change, and a three-way
  merge refuses while anything is staged. `switch` refuses during a merge.

### Revisions

Every command that takes a commit uses `resolveRevision` (`src/engine/revisions.ts`), which
understands what tutorials use: `HEAD` / `@`, branch names, full or abbreviated (4+) commit ids,
`~N` and `^` / `^N` suffixes in any combination (`HEAD~2^2`), and reflog positions
(`HEAD@{1}`, `main@{2}`). An unknown revision is reported with each command's own Git wording.

### Detached HEAD and branches

- `switch --detach <rev>` (and `git checkout <commit>`, which prints Git's long advice) points
  HEAD at a commit. `status` says `HEAD detached at abc1234`, `branch` lists
  `* (HEAD detached at abc1234)`, `log` decorates `(HEAD)`, and commits move HEAD directly.
- Leaving a detached HEAD whose commits no branch holds prints Git's warning
  (`Warning: you are leaving 1 commit behind...` with the `git branch <new-branch-name> <id>` hint);
  otherwise `Previous HEAD position was ...`.
- `git switch <commit>` refuses, as Git does: `a branch is expected, got commit`.
- `git switch -` returns to the previous branch, found in the reflog.
- `branch <name> <start-point>` / `switch -c <name> <start-point>` create branches elsewhere;
  `branch -d` refuses unmerged branches and the current one, `-D` forces.

### Reflog

isomorphic-git keeps no reflogs, so GitDojo writes them in Git's own format
(`.git/logs/HEAD`, `.git/logs/refs/heads/<branch>`) whenever HEAD or a branch moves: `commit:`,
`commit (initial):`, `commit (merge):`, `checkout: moving from x to y`, `merge x: Fast-forward`,
`reset: moving to HEAD~1`, `revert:`, `cherry-pick:`, `rebase (start|pick|finish):`,
`branch: Created from HEAD`. `git reflog` prints them newest first with decorations; the snapshot
exposes HEAD's as `reflog`. Lesson setup writes entries too, so "lost commit" scenarios are real.

### Undoing changes

- `diff` compares the staging area with the working tree (`--staged`: HEAD with the staging
  area) and prints unified diffs with three lines of context, `index a..b` headers,
  `new file` / `deleted file` modes and `\ No newline at end of file`. Untracked files are not
  shown. `data.files` has the hunks for the UI.
- `restore <path>` copies the staged version over the file; `--staged` copies HEAD's into the
  staging area (unstaging); both together restore from HEAD; `--source <rev>` takes another
  commit's version. Only tracked paths match, and conflicted paths are refused.
- `reset` moves the current branch (or a detached HEAD): `--soft` touches nothing else, `--mixed`
  (default) resets the staging area and prints `Unstaged changes after reset:`, `--hard` also
  resets tracked files (untracked files survive) and prints `HEAD is now at ...`. A word that is
  no revision but names a tracked file is a path: `git reset README.md` unstages it, as does
  `git reset HEAD -- README.md`. Resets abandon a stopped operation; `--soft` refuses during one.
- `rm` deletes tracked files and stages the deletion (`--cached` only untracks), refuses local
  modifications without `-f`, needs `-r` for folders, and resolves conflicted paths it removes.

### Revert, cherry-pick and rebase

All three apply a commit's changes with the same three-way machinery as merges
(`src/engine/three-way.ts`):

- **cherry-pick** applies the commit's changes (base: its parent) on top of HEAD and keeps the
  original message and author (`[main abc1234] Fix typo` / ` Date: ...`).
- **revert** applies them backwards (base: the commit, theirs: its parent) as
  `Revert "<subject>"\n\nThis reverts commit <oid>.`. History only grows.
- **rebase** detaches HEAD at the upstream, replays the branch's own commits (oldest first,
  merges dropped, already-applied changes skipped), then moves the branch and reattaches HEAD:
  `Successfully rebased and updated refs/heads/x.`. A branch with nothing of its own is
  fast-forwarded; one already on top prints `Current branch x is up to date.` It refuses with
  local changes or a detached HEAD. `git rebase -i` is not supported.

Merge commits are refused (`is a merge but no -m option was given`). Conflicts stop the
operation exactly like a merge: markers are labelled `HEAD` and `abc1234 (subject)` (revert:
`parent of abc1234 (subject)`), `status` explains how to continue, and the conflict record in
`.git/GITDOJO_MERGE.json` has a `kind` (`merge`, `revert`, `cherry-pick`, `rebase`; records
without one are merges). `--continue` (or `git commit`) records the commit; `--abort` puts
everything back; `rebase --skip` drops the stopped commit and goes on.

### Stash

Git stores stashes as special commits; GitDojo keeps them as records in `.git/GITDOJO_STASH.json`
(newest first), which keeps behaviour deterministic for small text files:

- `stash` / `stash push [-m <msg>] [-u]` saves staged and unstaged changes to tracked files (and
  untracked ones with `-u`), then puts those paths back to HEAD.
  `Saved working directory and index state WIP on main: abc1234 Subject`.
- `stash apply` / `pop` merge the saved edits into the current files. New files come back
  staged, edits unstaged, as in Git. If HEAD moved since, changes merge line by line; conflicts
  get `Updated upstream` / `Stashed changes` markers and the entry is kept. Local changes to the
  same files are refused.
- `stash list`, `drop`, `show` (a diffstat) accept `stash@{n}` or `n`.

### Racy Git and inodes

isomorphic-git detects edits by comparing file stats at one-second resolution, so a same-size
rewrite within a second looks unchanged unless the inode changes. LightningFS hands out
`highest inode + 1`, so deleting and recreating a file can reuse the same number. `replaceFile`
(`src/filesystem/fs-helpers.ts`) writes a temporary file first and renames it into place, which
guarantees a new inode; every working-tree write goes through it.

### Status classification

isomorphic-git reports each path as a `[HEAD, WORKDIR, STAGE]` triple. `classifyStatusRow` turns
that into `{ staged, unstaged }` changes (`added | modified | deleted` and
`modified | deleted | untracked`). `status`, `add`, `commit` and `snapshot` all share this function,
and `status-matrix.test.ts` documents every combination.

## Adding a Git command

1. Add a spec to `GIT_COMMAND_SPECS` in `packages/command-parser/src/commands.ts` (flags, required
   flags, whether it accepts arguments), and remove it from `PLANNED_GIT_COMMANDS`.
2. Implement it in `packages/git-engine/src/commands/<name>.ts`, returning a `GitCommandResult`.
3. Add the method to the `GitEngine` interface and `IsomorphicGitEngine`.
4. Route it in `packages/command-parser/src/router/router.ts`.
5. If it changes something learners should see, extend `GitRepositorySnapshot` and the mapping in
   `@gitdojo/repository-state`.
6. Add tests at each layer.

The browser needs a global `Buffer` for isomorphic-git; `src/polyfills.ts` provides it and is
imported first by the package entry point.
