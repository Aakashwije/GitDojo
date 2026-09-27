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

Validators must be pure functions of `RepositoryState`. If a validator needs information the state
does not have yet, extend `RepositoryState` (and the snapshot mapping in
`@gitdojo/repository-state`) rather than reaching into Git from the validator.
