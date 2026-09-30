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
await git.log({ oneline: true });
await git.showBranches(); // `git branch`
await git.createBranch("feature/login"); // `git branch feature/login`
await git.switchBranch("feature/login"); // `git switch feature/login`
await git.createAndSwitchBranch("bugfix"); // `git switch -c bugfix`
await git.listBranches(); // BranchState[] as data, no output
await git.merge("feature/login"); // `git merge feature/login` (fast-forward or merge commit)
await git.merge("feature/login", { noFastForward: true }); // `git merge --no-ff ...`
await git.abortMerge(); // `git merge --abort`
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

| Code                   | When                                                     | Output                                                                 |
| ---------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `NOT_A_REPOSITORY`     | Any command except `init` before `git init`              | `fatal: not a git repository (or any of the parent directories): .git` |
| `NOTHING_TO_COMMIT`    | `commit` with nothing staged                             | The `git status` report, e.g. `nothing to commit, working tree clean`  |
| `NO_COMMITS`           | `log` on an unborn branch                                | `fatal: your current branch 'main' does not have any commits yet`      |
| `FILE_NOT_FOUND`       | `add` with a pathspec that matches nothing               | `fatal: pathspec 'x' did not match any files`                          |
| `INVALID_ARGUMENT`     | Empty commit message, no pathspec, path outside repo     | e.g. `error: commit message is required`                               |
| `INVALID_BRANCH_NAME`  | A name Git's `check-ref-format` rules reject             | `fatal: 'a..b' is not a valid branch name`                             |
| `BRANCH_EXISTS`        | Creating a branch that exists (or clashes with `x/y`)    | `fatal: a branch named 'main' already exists`                          |
| `BRANCH_NOT_FOUND`     | Switching to a branch that does not exist                | `fatal: invalid reference: x`                                          |
| `CHECKOUT_CONFLICT`    | Switching or merging would overwrite uncommitted work    | Git's `Your local changes ... would be overwritten by ...` report      |
| `MERGE_CONFLICT`       | `merge` stopped with conflicts (`data.type: "conflict"`) | `CONFLICT (content): Merge conflict in x` and the failure summary      |
| `MERGE_IN_PROGRESS`    | `merge` or `switch` while a merge is unfinished          | `fatal: You have not concluded your merge (MERGE_HEAD exists).`        |
| `UNRESOLVED_CONFLICTS` | `commit` while conflicts remain                          | `error: Committing is not possible because you have unmerged files.`   |
| `NO_MERGE`             | `merge --abort` with no merge in progress                | `fatal: There is no merge to abort (MERGE_HEAD missing).`              |
| `UNKNOWN`              | Unexpected internal failure                              | Generic message                                                        |

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
- `git checkout <branch>` and `git checkout -b <name>` are routed to the same methods for
  comparison with older tutorials; an unknown name is reported as a pathspec, as Git does. Lessons
  teach `git switch`. Start points (`git switch -c new main`) are not supported yet.
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
