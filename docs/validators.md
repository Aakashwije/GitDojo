# Validators

Validators decide whether a lesson objective is met by inspecting the **resulting repository
state**, never the command the learner typed. `git add README.md`, `git add .` and `git add -- README.md`
all satisfy "README.md is staged".

## Supported validators

| Type                     | Fields     | Passes when                                                                    |
| ------------------------ | ---------- | ------------------------------------------------------------------------------ |
| `repository_initialized` | –          | The workspace is a Git repository.                                             |
| `file_exists`            | `file`     | The file exists in the working tree (works before `git init` too).             |
| `file_staged`            | `file`     | The file has staged changes (added, modified or deleted in the index).         |
| `commit_exists`          | `message?` | At least one commit exists; with `message`, a commit has exactly that message. |
| `commit_count`           | `count`    | HEAD's history has exactly `count` commits.                                    |
| `clean_worktree`         | –          | Initialized, nothing staged, and every file is committed and unmodified.       |

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

| Type                     | Fields                | Passes when                                                                           |
| ------------------------ | --------------------- | ------------------------------------------------------------------------------------- |
| `branches_merged`        | `branch`, `into?`     | `branch`'s tip is reachable from `into` (default: the current branch).                |
| `merge_commit_exists`    | `branch?`, `message?` | A commit with two or more parents is in `branch`'s history (default: HEAD).           |
| `branch_contains_commit` | `branch`, `message`   | A commit with exactly `message` is in `branch`'s history.                             |
| `conflict_exists`        | `file?`               | A merge is in progress with a conflict (in `file`, if given).                         |
| `conflict_resolved`      | `file`                | The conflict in `file` has had its markers removed and been staged with `git add`.    |
| `all_conflicts_resolved` | –                     | A merge is in progress, it has conflicts, and every one is resolved.                  |
| `merge_completed`        | `branch?`             | No merge is in progress and HEAD's history has a merge commit (with `branch` merged). |

`branches_merged` passes for fast-forwards and merge commits alike; pair it with
`branch_points_to_commit` (`sameAs`) or `merge_commit_exists` to require one or the other.
`merge_completed` needs a merge commit, so a fast-forward does not count. Conflict validators only
describe the merge in progress: once it is committed they stop passing, which is fine because
progress is sticky. `clean_worktree` fails while a merge is in progress.

File paths may be written as `README.md` or `./README.md`.

```yaml
validator:
  type: commit_exists
  message: Initial commit
```

## API

```ts
import { validateLesson, validateObjective } from "@gitdojo/validator";

const result = await validateObjective(objective, { repository });
// { passed: false, reason: "README.md is not staged." }

const lessonResult = await validateLesson(lesson, { repository });
// { lessonId, objectives: [{ objectiveId, passed, reason? }], passedCount, totalCount, completed }
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
