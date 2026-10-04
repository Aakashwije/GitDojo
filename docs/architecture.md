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
Lesson/Challenge    packages/lesson-engine           sticky, ordered objective progress → completion
   ↓
Progress            packages/progress                completions, XP, command and hint counts (IndexedDB)
   ↓
UI                  apps/web                         Zustand stores → React panels, graph, dashboard
```

After **every** command the web app recomputes repository state from scratch, validates the
lesson, and pushes the results into Zustand stores. Nothing patches state incrementally, so the
UI can never drift from what is actually in the repository.

The orchestration lives in `WorkspaceSession`
(`apps/web/features/workspace/services/workspace-session.ts`) and its subclasses: `LearningSession`
validates a lesson or challenge after every step, `PlaygroundSession` (see
[Playground](#playground)) just publishes state.

```text
execute(input)
  → runCommandLine(input)        parse + route + GitEngine
  → stateReader.read(workspace)  normalized RepositoryState
  → validateLesson(lesson)       current pass/fail per objective
  → advanceProgress(...)         sticky progress (see below)
  → { result, snapshot }         published to the stores; the terminal prints the result
```

Operations on a session are queued, so a lesson reset can never interleave with a running command.

The terminal is not the only input: learners also edit files. The code editor and the conflict
editor save through `WorkspaceSession.writeFile` (and `createFile` / `deleteFile`), which go
through the same queue and are followed by the same state read, validation and progress update as
a command. They write the working tree only; staging is still `git add`, and marking a conflict
resolved is too, so nothing is ever staged or resolved automatically.

## Code editor

`apps/web/features/editor` is a deliberately small editor built for learning Git, not a VS Code
clone:

```text
Monaco edit
   ↓  EditorController: draft → debounced save (400 ms), Ctrl/Cmd+S or blur saves at once
WorkspaceSession.writeFile
   ↓  virtual filesystem (new inode, so Git sees the change)
Repository State refresh
   ↓
Explorer shows "M", Working Tree lists the file as modified
```

- **FileExplorer** shows the working tree as a folder tree with Git's one-letter statuses
  (`U` untracked, `M` modified, `A` staged new file, `D` deleted, `C` conflict), and can create
  and delete files.
- **EditorTabs** show open files with an unsaved-changes dot; **CodeEditor** wraps Monaco with
  line numbers and syntax highlighting, and nothing that distracts (no minimap or IntelliSense).
- After every command the store's `revision` changes and clean tabs are re-read, so
  `git restore`, `git switch` or `git reset --hard` show up in open files. Tabs with unsaved
  typing are never overwritten.
- Lessons can set `editor: { readOnly: true }`.
- Monaco is **served by GitDojo itself**: `scripts/copy-monaco.mjs` copies its prebuilt bundle to
  `public/monaco` before `next dev` / `next build`. No editor code is loaded from a CDN.

## Playground

`/playground` is a workspace with no lesson: editor, terminal, graph and Git's three areas.
`PlaygroundSession` (`apps/web/features/playground`) is a `WorkspaceSession` that validates nothing
and is **not rebuilt on load**. Its repository lives in IndexedDB like every workspace, so a
refresh continues where the learner was. LightningFS saves its directory tree half a second after
the last write, so the playground flushes after every command and edit (`VirtualFileSystem.flush`)
and a reload never loses work.

- **Scenarios** are content: `content/playground/<id>.yaml`, each a `setup` block exactly like a
  lesson's (see [lesson-authoring.md](./lesson-authoring.md#playground-scenarios)). The scenario
  a repository came from is remembered in `localStorage`, so **Reset** can rebuild it.
- **New repository** starts a blank folder with a README and no `.git`.
- **Export** downloads a JSON snapshot: the working-tree files plus the normalized
  `RepositoryState` (commits, branches, reflog...).

## Challenges

`/challenges` lists real-world problems by category; `/challenges/<id>` runs one. Challenges are
YAML in `content/challenges/` (see [challenge-authoring.md](./challenge-authoring.md)), loaded and
validated by `@gitdojo/challenge-engine`, which turns each into a lesson of type `challenge` so the
same workspace, setup, validation and progress code runs it. A challenge whose `requires` names a
command GitDojo cannot run yet is shown as locked. Challenge workspaces are `challenge-<id>`, and
solved challenges are recorded in local progress as challenges, separately from lessons (see
[progress.md](./progress.md)).

## Error explanations

The terminal always prints Git's real message. Next to it, `@gitdojo/error-engine` explains what
happened for learners: after every command, `explainCommand({ command, ok, output, errorCode,
repository })` maps the engine's or parser's error code to a `GitEducationalError`
(`shared-types`): a title, a plain-words explanation, likely causes, hints and a lesson to
learn more from.

```text
$ git switch feature/logn
fatal: invalid reference: feature/logn          ← terminal: unchanged Git output

Why did this happen?                             ← explanation panel under the terminal
  There is no branch with that name
  Likely causes: Did you mean `feature/login`? This repository's branches are ...
```

- Explanations use the repository state **after** the command, so causes can name the learner's
  own files and branches, and suggest the closest match for a typo (edit distance).
- Some successful commands get a **notice** instead of an error: entering a detached HEAD, or
  leaving commits behind when leaving one.
- About thirty educational codes cover every engine and parser error (`NOT_A_REPOSITORY`,
  `NOTHING_TO_COMMIT`, `UNKNOWN_BRANCH`, `UNSTAGED_CHANGES`, `MERGE_CONFLICT`, `DETACHED_HEAD`,
  `NON_FAST_FORWARD`, `INVALID_COMMIT`, `BRANCH_ALREADY_EXISTS`, `PATH_NOT_FOUND`, ...).
- In challenges, suggestions and lesson links are hidden: they would name the solution.

## Progressive hints

`@gitdojo/hints` settles each hint's level (1 concept, 2 command, 3 answer; see
[lesson-authoring.md](./lesson-authoring.md#hints)), validates hint ladders for the lesson and
challenge schemas, and provides pure state functions (`createHintState`, `revealNext`,
`visibleHints`, `nextHint`, `hintsUsed`). The lesson store keeps one `HintState`
(`{ objectiveId, revealedHints, totalHints }`) per objective for the current attempt; the hint
panel labels each hint's level, asks before showing an answer, and shows the current
objective's validator `reason` as "Not yet: ...". The completion card reports how many hints were
used.

## Packages

| Package                     | Responsibility                                                          | Depends on                                         |
| --------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| `@gitdojo/shared-types`     | Domain contracts: `RepositoryState`, lesson and validator types, errors | –                                                  |
| `@gitdojo/git-engine`       | `VirtualFileSystem`, `GitEngine`, path safety                           | shared-types, isomorphic-git, LightningFS          |
| `@gitdojo/command-parser`   | Tokenizer, parser, command specs, router                                | git-engine (types), shared-types                   |
| `@gitdojo/repository-state` | `RepositoryStateReader`: engine snapshot → `RepositoryState`            | git-engine, shared-types                           |
| `@gitdojo/validator`        | Validator registry, `validateObjective`, `validateLesson`, Zod schema   | shared-types, zod                                  |
| `@gitdojo/lesson-engine`    | Lesson schema, YAML loader, setup/reset, progress, playground scenarios | validator, git-engine, repository-state, yaml, zod |
| `@gitdojo/challenge-engine` | Challenge schema, loader, categories, availability                      | lesson-engine, command-parser, yaml, zod           |
| `@gitdojo/error-engine`     | Educational explanations for command outcomes                           | command-parser, shared-types                       |
| `@gitdojo/hints`            | Hint levels, ladder validation, hint state                              | shared-types                                       |
| `@gitdojo/progress`         | Local progress: model, XP rules, IndexedDB storage, migration, metrics  | shared-types                                       |
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
7. **Progress follows state, not text.** A lesson or challenge is completed only when its
   validators pass; command usage is counted from what the router actually ran
   (`CommandExecutionResult.gitCommand`), never by matching the typed line.

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

What a learner has done is kept by `@gitdojo/progress` in its own IndexedDB database, with no
account needed; see [progress.md](./progress.md). A hands-on lesson is recorded as finished when
its objectives are complete; a concept lesson when the learner marks it complete. Course
completion is never stored: it is derived from completed lessons and the course's current lesson
list. The dashboard (`/dashboard`) shows totals, course progress, recent activity and command
usage, and lets the learner export or reset their progress.

## Accounts

Optional accounts use WSO2 Identity Platform through `@asgardeo/nextjs`; see
[authentication.md](./authentication.md). The SDK provider renders only in the `app/(account)/`
route group (sign-in, sign-up, callback, sign-out, account), so learning pages stay static and
work without any configuration. Headers learn the account state from `/api/auth/session`, which
validates the session on the server. `proxy.ts` refreshes sessions and guards `/account` on
account routes only. Accounts never read or change local progress.

## Web app structure

```text
apps/web/
├── app/                        routes: /, /learn, /learn/[course], /learn/[course]/[lesson], /learn/demo,
│                               /playground, /challenges, /challenges/[slug], /dashboard,
│                               (account)/: /sign-in, /sign-up, /account, /auth/*; /api/auth/session
├── components/                 site chrome and landing page
├── features/
│   ├── terminal/               xterm host, line editor, history, output highlighting
│   ├── repository/             graph (React Flow), working tree / staging / repository panels
│   ├── challenges/             challenge browser, cards, navigation
│   ├── conflicts/              conflict banner and the conflict editor
│   ├── editor/                 Monaco editor, file explorer, tabs, EditorController
│   ├── errors/                 "Why did this happen?" explanation panel
│   ├── course/                 course outline and navigation
│   ├── progress/               progress store, ProgressProvider, dashboard, lesson tracking hook
│   ├── auth/                   account controls, sign-in/up/out components, session store
│   ├── lesson/                 lesson panel, objectives, hints, completion, concept content
│   ├── playground/             PlaygroundSession, scenario picker, playground layout
│   └── workspace/              WorkspaceSession, LearningSession, browser environment, layout
├── lib/auth/                   auth config, return-path validation, server session (SDK boundary)
├── proxy.ts                    session refresh and /account guard (account routes only)
├── e2e/                        Playwright tests (desktop + mobile), axe scans, mock identity provider
└── perf/                       stress scenarios (`pnpm perf`, `pnpm perf:browser`)
```

Stores (`use-repository-store`, `use-lesson-store`, `use-terminal-store`) hold view state only;
business logic lives in the packages and in `LearningSession`. `use-progress-store` mirrors the
saved progress for React; `@gitdojo/progress` owns persistence.
