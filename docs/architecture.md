# Architecture

GitDojo runs entirely in the browser. There is no server-side shell, no `child_process`, and no
container: every command a learner types is parsed by GitDojo's own parser and executed by
[isomorphic-git](https://isomorphic-git.org) against a virtual filesystem stored in IndexedDB.

## The core loop

```text
Terminal            apps/web/features/terminal       xterm.js renders; a controller edits the line
   ↓
Command Parser      packages/command-parser          tokenize → parse → ParsedCommand (or a ParseError)
   ↓
Command Router      packages/command-parser/router   ParsedCommand → GitEngine method
   ↓
GitEngine           packages/git-engine              the only code that imports isomorphic-git
   ↓
Virtual Filesystem  packages/git-engine/filesystem   LightningFS + IndexedDB, one directory per workspace
   ↓
Repository State    packages/repository-state        Git snapshot → normalized RepositoryState
   ↓
Validator Engine    packages/validator               RepositoryState → pass/fail per objective
   ↓
UI                  apps/web                         Zustand stores → React panels, graph, objectives
```

After **every** command the web app recomputes repository state from scratch, validates the
lesson, and pushes the results into Zustand stores. Nothing patches state incrementally, so the
UI can never drift from what is actually in the repository.

The orchestration lives in one small class, `LearningSession`
(`apps/web/features/workspace/services/learning-session.ts`):

```text
execute(input)
  → runCommandLine(input)        parse + route + GitEngine
  → stateReader.read(workspace)  normalized RepositoryState
  → validateLesson(lesson)       current pass/fail per objective
  → advanceProgress(...)         sticky progress (see below)
  → { result, snapshot }         published to the stores; the terminal prints the result
```

Operations on a session are queued, so a lesson reset can never interleave with a running command.

## Packages

| Package                     | Responsibility                                                          | Depends on                                         |
| --------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| `@gitdojo/shared-types`     | Domain contracts: `RepositoryState`, lesson and validator types, errors | –                                                  |
| `@gitdojo/git-engine`       | `VirtualFileSystem`, `GitEngine`, path safety                           | shared-types, isomorphic-git, LightningFS          |
| `@gitdojo/command-parser`   | Tokenizer, parser, command specs, router                                | git-engine (types), shared-types                   |
| `@gitdojo/repository-state` | `RepositoryStateReader`: engine snapshot → `RepositoryState`            | git-engine, shared-types                           |
| `@gitdojo/validator`        | Validator registry, `validateObjective`, `validateLesson`, Zod schema   | shared-types, zod                                  |
| `@gitdojo/lesson-engine`    | Lesson schema, YAML loader, setup/reset, progress                       | validator, git-engine, repository-state, yaml, zod |
| `@gitdojo/ui`               | Design tokens (from `UI.md`) and shadcn/ui-style components             | radix-ui, tailwind-merge                           |
| `@gitdojo/config`           | Shared TypeScript, ESLint and Prettier configuration                    | –                                                  |
| `@gitdojo/web`              | Next.js app: landing page, courses and the lesson workspace             | everything above                                   |

Every package exposes a single public entry point through `package.json#exports` (plus
`@gitdojo/lesson-engine/node` for the Node-only lesson source). Import from the package name,
never from another package's `src/` internals.

Packages ship TypeScript source ("internal packages"). Next.js compiles them through
`transpilePackages`, and Vitest runs them directly, so there is no separate build step for
libraries.

## Architectural rules

1. **The UI never calls isomorphic-git.** Only `packages/git-engine` imports it, and its result
   types never leak out. Everything else sees `GitCommandResult`, `GitRepositorySnapshot` and
   `RepositoryState`.
2. **Terminal input always goes through the parser.** Even `clear` and `help` are parsed and
   routed; the terminal component has no command logic of its own.
3. **Validators inspect repository state, never command text.** `git add README.md` and
   `git add .` both satisfy "README.md is staged".
4. **Lessons are content.** Lesson YAML lives in `content/lessons` and is validated with Zod at
   build time and in CI. No lesson-specific logic lives in React components.
5. **Repository state is normalized.** UI components render `RepositoryState` and never need to
   know about status matrices or object ids.
6. **Modules are independently testable.** Each package has its own Vitest suite that runs in
   Node against an in-memory IndexedDB (`fake-indexeddb`).

## Safety model

- **No real shell.** Unsupported programs (`ls`, `rm`, ...) are rejected by the parser with
  `command not found`. Nothing reaches the operating system.
- **Workspace isolation.** Each lesson has its own directory, `/gitdojo/<workspace-id>/`, inside
  one LightningFS database. Workspace ids are validated against a strict pattern.
- **Path traversal protection.** `normalizeWorkspacePath` rejects any `..` segment, backslashes and
  null bytes instead of resolving them, so learner- or lesson-supplied paths can never name
  anything outside their workspace. The virtual filesystem also refuses to write into `.git`.
- **UI-safe errors.** Engine and router failures are converted to Git-like messages with an
  internal error code. Stack traces are logged to the developer console, never shown to learners.

## Lesson progress is sticky and ordered

Validators describe the _current_ state. Some lesson steps undo earlier ones: committing empties
the staging area, so "README.md is staged" stops being true. `advanceProgress` in
`@gitdojo/lesson-engine` therefore keeps an objective completed once it has passed, until the
lesson is reset.

Objectives also complete **in order**: an objective can only complete once every objective before
it has. This lets a lesson ask for something that is already true at the start ("switch back to
`main`"), and lets a challenge list the end state it expects without it being ticked off early.
Several objectives can complete after a single command.

## Courses and progress

Courses live in `content/courses/<slug>.yaml` and list lesson slugs in order; each course's lessons
live in `content/lessons/<course slug>/`. Every course page and lesson page is generated statically
at build time (`/learn`, `/learn/[course]`, `/learn/[course]/[lesson]`).

Which lessons a learner has finished is kept in `localStorage` (`use-course-progress`), until
accounts exist. A hands-on lesson is recorded as finished when its objectives are complete; a
concept lesson when the learner marks it complete.

## Web app structure

```text
apps/web/
├── app/                        routes: /, /learn, /learn/[course], /learn/[course]/[lesson], /learn/demo
├── components/                 site chrome and landing page
├── features/
│   ├── terminal/               xterm host, line editor, history, output highlighting
│   ├── repository/             graph (React Flow), working tree / staging / repository panels
│   ├── course/                 course outline, navigation, progress (localStorage)
│   ├── lesson/                 lesson panel, objectives, hints, completion, concept content
│   └── workspace/              LearningSession, browser environment, layout
└── e2e/                        Playwright tests
```

Stores (`use-repository-store`, `use-lesson-store`, `use-terminal-store`) hold view state only;
business logic lives in the packages and in `LearningSession`.
