# Validators

Validators decide whether a lesson objective is met by inspecting the **resulting repository
state**, never the command the learner typed. `git add README.md`, `git add .` and `git add -- README.md`
all satisfy "README.md is staged".

## Supported validators

| Type                     | Fields                       | Passes when                                                                    |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------ |
| `repository_initialized` | –                            | The workspace is a Git repository.                                             |
| `file_exists`            | `file`                       | The file exists in the working tree (works before `git init` too).             |
| `file_staged`            | `file`                       | The file has staged changes (added, modified or deleted in the index).         |
| `file_committed`         | `file`                       | The file is in the last commit and unchanged since.                            |
| `file_not_tracked`       | `file`                       | Git does not track the file: untracked, ignored or absent.                     |
| `file_content`           | `file`, `content`            | The working-tree file has exactly the authored text.                           |
| `commit_exists`          | `message?`                   | At least one commit exists; with `message`, a commit has exactly that message. |
| `commit_count`           | `count`                      | HEAD's history has exactly `count` commits.                                    |
| `commit_changes`         | `branch`, `message`, `files` | The named commit changes exactly those paths.                                  |
| `clean_worktree`         | –                            | Initialized, nothing staged, and every file is committed and unmodified.       |

| Type          | Fields           | Passes when                                                                        |
| ------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `file_status` | `file`, `status` | The file's working-tree status is exactly `status` (`untracked`, `modified`, ...). |

`file_not_tracked` followed by `clean_worktree` requires that a file is **ignored** (listed in
`.gitignore`) rather than committed or merely left untracked. `file_status` with
`status: modified` checks that an edit is still there, uncommitted and unstaged (after
`git stash pop`, `git restore --staged`, ...).

`file_content` compares exact text, including line breaks. `commit_changes` finds the named commit
in the selected branch's history and compares its changed paths with `files`; order does not
matter. These validators let content-sensitive challenges verify both the final file and focused
commit boundaries.

### Branch validators

| Type                      | Fields                          | Passes when                                                                                 |
| ------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| `branch_exists`           | `branch`                        | The branch exists. An unborn branch (no commits yet) does not count, as in Git.             |
| `branch_not_exists`       | `branch`                        | No branch with that name exists.                                                            |
| `current_branch`          | `branch`                        | HEAD is attached to the branch.                                                             |
| `branch_points_to_commit` | `branch`, `message` or `sameAs` | The branch's tip commit has exactly `message`, or it points at the same commit as `sameAs`. |
| `commit_on_branch`        | `branch`, `message?`, `notOn?`  | A commit reachable from `branch` (with `message`, if given) is not reachable from `notOn`.  |

`branch_points_to_commit` needs exactly one of `message` and `sameAs`. `commit_on_branch` with
`notOn: main` is how a lesson says "a commit made on the feature branch, not on main"; without
`notOn` it also counts commits the branch inherited.

```yaml
validator:
  type: commit_on_branch
  branch: feature/login
  notOn: main
```

### Merge validators

| Type                      | Fields                | Passes when                                                                           |
| ------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| `branches_merged`         | `branch`, `into?`     | `branch`'s tip is reachable from `into` (default: the current branch).                |
| `merge_commit_exists`     | `branch?`, `message?` | A commit with two or more parents is in `branch`'s history (default: HEAD).           |
| `branch_contains_commit`  | `branch`, `message`   | A commit with exactly `message` is in `branch`'s history.                             |
| `conflict_exists`         | `file?`               | A merge is in progress with a conflict (in `file`, if given).                         |
| `conflict_resolved`       | `file`                | The conflict in `file` has had its markers removed and been staged with `git add`.    |
| `conflict_ready_to_stage` | `file`                | `file` is still in conflict, but its working-tree text has no marker lines left.      |
| `all_conflicts_resolved`  | –                     | A merge is in progress, it has conflicts, and every one is resolved.                  |
| `merge_completed`         | `branch?`             | No merge is in progress and HEAD's history has a merge commit (with `branch` merged). |

`branches_merged` passes for fast-forwards and merge commits alike; pair it with
`branch_points_to_commit` (`sameAs`) or `merge_commit_exists` to require one or the other.
`merge_completed` needs a merge commit, so a fast-forward does not count. Conflict validators
describe the operation in progress (a merge, or a revert, cherry-pick or rebase step stopped for
conflicts): once it is committed they stop passing, which is fine because progress is sticky.
`clean_worktree` fails while any such operation is in progress. `conflict_ready_to_stage` exists
for [adaptive hints](./lesson-authoring.md#adaptive-hints): it passes while a learner has edited
the markers out of a conflicted file but not staged it yet, and stops passing once `git add` marks
the conflict resolved. A marker is a line that starts with seven `<`, `=` or `>`, the same rule
`git add` uses to refuse a file.

### Recovery validators

| Type                   | Fields               | Passes when                                                                    |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------ |
| `commit_not_on_branch` | `branch`, `message`  | `branch` exists and no commit with exactly `message` is in its history.        |
| `commit_reverted`      | `message`, `branch?` | A `Revert "<message>"` commit (as `git revert` writes it) is in the history.   |
| `branch_rebased`       | `branch`, `onto`     | `onto`'s tip is in `branch`'s history and the branch's own commits are linear. |
| `head_detached`        | –                    | HEAD points at a commit, not a branch.                                         |
| `stash_count`          | `count`              | `git stash list` has exactly `count` entries.                                  |

`commit_not_on_branch` is how a lesson checks that `git reset` really took a commit off a
branch, or that a cherry-pick did not bring unwanted commits along. Because progress is sticky,
put checks that are already true at the start (like "history has two commits") after a check
that only passes at the end, so they are judged on the final state.

### History, tag and remote validators

| Type                                      | Fields                                        | Passes when                                                                                                                     |
| ----------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `branch_history`                          | `branch`, `messages`, `complete?`             | Following first parents, the branch's newest commits have exactly these subjects (newest first); `complete`: the whole history. |
| `tag_exists`                              | `tag`, `message?`, `annotated?`               | The tag exists; with `message`, it names that commit; with `annotated`, it is (or is not) an annotated tag.                     |
| `tag_not_exists`                          | `tag`                                         | No tag with that name exists.                                                                                                   |
| `remote_branch_points_to_commit`          | `branch`, `remote?`, `message` or `sameAs`    | The simulated remote's (default `origin`) branch points at the commit with `message`, or where the local `sameAs` does.         |
| `remote_tracking_branch_points_to_commit` | `ref`, `message` and/or `matchesRemote: true` | The remote-tracking branch (`origin/main`) exists and points at `message`'s commit, or where the remote's branch is now.        |
| `branch_upstream`                         | `branch`, `upstream`                          | The branch tracks `upstream` (`origin/feature`), as `git push -u` or `git switch <remote branch>` sets it.                      |

`branch_history` compares subjects only, so a squashed commit whose message keeps the original
subject still matches, and a merge commit in the way does not: it is how interactive-rebase
lessons check the rewritten history without caring which todo actions produced it.
`remote_tracking_branch_points_to_commit` with `matchesRemote` is "has fetched": `origin/main`
is where the simulated server's `main` is right now. Remote validators read the simulated
server's state from `RepositoryState.remotes`, which only GitDojo can see; a learner's
repository learns about it through `git fetch`.

File paths may be written as `README.md` or `./README.md`.

```yaml
validator:
  type: commit_exists
  message: Initial commit
```

## API

```ts
import {
  evaluateAdaptiveHints,
  evaluateTips,
  validateLesson,
  validateObjective,
} from "@gitdojo/validator";

const result = await validateObjective(objective, { repository });
// { passed: false, reason: "README.md is not staged." }

const lessonResult = await validateLesson(lesson, { repository });
// { lessonId, objectives: [{ objectiveId, passed, reason? }], passedCount, totalCount, completed }

const tips = await evaluateTips(lesson.tips ?? [], { repository });
// ids of the tips whose every condition holds, in authored order

const rule = await evaluateAdaptiveHints(lesson.adaptiveHints ?? [], "commit-rest", { repository });
// id of the first rule for that objective whose every condition holds, or null
```

Validation never rejects. A handler that throws counts as not passed, and the error is logged.

`validateLesson` reports what is true **right now**. The lesson engine's `advanceProgress` turns
that into sticky learner progress (see [architecture.md](./architecture.md#lesson-progress-is-sticky)).

## Adding a validator

1. Add the definition to the `ValidatorDefinition` union in
   `packages/shared-types/src/validator.ts`.
2. Add its Zod schema to `packages/validator/src/schema.ts`. The `satisfies` check fails to compile
   if the schema and the type disagree.
3. Implement the handler in `packages/validator/src/validators/<name>.ts`. It receives the typed
   definition and `{ repository }`, and returns `{ passed, reason? }`. Reasons are shown to learners,
   so keep them short and factual.
4. Register it in `packages/validator/src/registry.ts`. The `ValidatorRegistry` type makes a
   missing entry a compile error.
5. Add tests to `packages/validator/src/validate.test.ts`.
6. Document it in the table above.

Validators must be pure functions of `RepositoryState`. Branch validators use `branches` (name →
commit) and `allCommits` (every commit on every branch, with parents) to work out reachability;
`commits` only holds HEAD's history. If a validator needs information the state
does not have yet, extend `RepositoryState` (and the snapshot mapping in
`@gitdojo/repository-state`) rather than reaching into Git from the validator.
