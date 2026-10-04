<div align="center">

<img src="docs/assets/gitdojo-banner.png" alt="GitDojo" width="640" />

# GitDojo

**Learn Git by doing.**

_Learn it. Break it. Fix it. Master it._

</div>

GitDojo is an open-source interactive Git learning environment where developers learn Git by typing
real commands, manipulating safe browser-based repositories, and visualizing what happens
internally.

> **Status: early development.** Five courses, from Git Basics to Undo and Recover, ten real-world
> challenges and a free playground run end to end in the browser: a real Git engine, a terminal
> and code editor, live working tree / staging / branch graph visualization, state-based
> objective validation, progressive hints, plain-words error explanations, a progress dashboard
> saved locally with no account, and optional accounts through WSO2 Identity Platform. Syncing
> progress to accounts is on the [roadmap](#roadmap).

## What it does today

Open the demo lesson at `/learn/demo` ("Your First Commit"):

1. A virtual repository is created in your browser with a `README.md`.
2. You type `git status`, `git init`, `git add README.md` and `git commit -m "Initial commit"` into
   a real terminal.
3. Watch `README.md` move from **Working Tree** to **Staging Area**, and a commit appear in the
   **Repository Graph** with `main` and `HEAD` labels.
4. Objectives tick off as the repository reaches the right state. `git add .` works just as well
   as `git add README.md`, because GitDojo checks the result, not the command.

Or pick a course at `/learn`:

- **Git Basics** (10 lessons): what Git is, `git init`, reading `git status`, the working tree and
  staging area, `git add`, `git commit`, `git log`, and a first-repository challenge.
- **Branching** (6 lessons): branches and HEAD, `git branch`, `git switch` / `git switch -c`,
  committing on a feature branch, and a branching challenge. The graph draws each branch in its own
  lane.
- **Merging** (5 lessons): fast-forward and three-way merges, merge commits, the feature-branch
  workflow, and a merge challenge.
- **Merge Conflicts** (5 lessons): why conflicts happen, reading conflict markers, and resolving
  them by hand in a built-in editor, across one file or several.
- **Undo and Recover** (10 lessons): `git diff`, `git restore`, the three trees and
  `git reset`, `git revert`, `git stash`, `git cherry-pick`, recovering lost commits with
  `git reflog`, and `git rebase`.

Then:

- **Challenges** (`/challenges`): ten real-world problems ("you committed to the wrong
  branch...") with a scenario, a mission and success conditions, but no step-by-step
  instructions.
- **Playground** (`/playground`): no lesson at all. Edit files, run anything, load ready-made
  scenarios (a merge conflict, a detached HEAD, a repository to recover...), and come back later:
  it survives a refresh.

Your progress is saved in the browser, no account needed. The **dashboard** (`/dashboard`) shows
where to continue, lessons and challenges completed, XP, the Git commands you have used, course
progress and recent activity, and lets you export your progress as JSON or reset it.

Accounts are optional. When a site configures [WSO2 Identity Platform](docs/authentication.md),
learners can **sign up and sign in** on its secure hosted pages (GitDojo never handles
passwords) and get an account menu on every page. Signing in or out never touches local
progress; linking progress to accounts comes later.

Every workspace has a **code editor** (Monaco) with a file explorer and Git status letters, so
editing a file really makes it "modified". When a command fails, the terminal shows Git's real
message and a **"Why did this happen?"** panel explains it, with likely causes based on your own
files and branches. **Hints** climb from a concept to the exact command, which only appears on
request.

Supported commands: `init`, `status`, `add`, `rm`, `commit`, `log`, `diff`, `restore`, `branch`,
`switch`, `checkout`, `merge`, `reset`, `revert`, `stash`, `cherry-pick`, `reflog` and `rebase`
(type `help` in any terminal).

Everything runs locally in the browser: Git is [isomorphic-git](https://isomorphic-git.org), files
live in IndexedDB via [LightningFS](https://github.com/isomorphic-git/lightning-fs), the editor is
[Monaco](https://microsoft.github.io/monaco-editor/) served from GitDojo itself, and there is no
real shell anywhere.

## Architecture

```text
Terminal (xterm.js)
  → Command Parser      tokenize + parse; unsupported programs never execute
  → Command Router      ParsedCommand → GitEngine
  → GitEngine           the only module that imports isomorphic-git
  → Virtual Filesystem  LightningFS + IndexedDB, one isolated directory per lesson
  → Repository State    normalized model: files, staged files, commits, branches
  → Validator Engine    lesson objectives checked against repository state
  → Progress            completions, XP and command stats, saved in IndexedDB
  → UI                  Zustand stores → React panels, React Flow graph, dashboard
```

See [docs/architecture.md](docs/architecture.md) for the full picture, including the safety model.

## Tech stack

| Area          | Choice                                                       |
| ------------- | ------------------------------------------------------------ |
| App           | Next.js 16 (App Router), React 19, TypeScript (strict)       |
| Styling       | Tailwind CSS 4, shadcn/ui-style components on Radix          |
| Terminal      | xterm.js                                                     |
| Editor        | Monaco (self-hosted, no CDN)                                 |
| Git           | isomorphic-git                                               |
| Filesystem    | LightningFS on IndexedDB                                     |
| Visualization | React Flow                                                   |
| State         | Zustand                                                      |
| Content       | YAML lessons validated with Zod                              |
| Accounts      | WSO2 Identity Platform (`@asgardeo/nextjs`), optional        |
| Tests         | Vitest, React Testing Library, Playwright                    |
| Tooling       | pnpm workspaces, Turborepo, ESLint, Prettier, GitHub Actions |

## Local development

Requirements: Node.js 20.9+ (24 recommended, see `.nvmrc`) and pnpm via Corepack.

```bash
corepack enable
pnpm install
pnpm dev            # http://localhost:3000, then open /learn
```

| Command                 | What it does                                                            |
| ----------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`              | Start the web app in development mode                                   |
| `pnpm build`            | Production build (also validates every lesson)                          |
| `pnpm lint`             | ESLint across all packages                                              |
| `pnpm typecheck`        | `tsc --noEmit` across all packages                                      |
| `pnpm test`             | Unit and integration tests (Vitest) across all packages                 |
| `pnpm validate:content` | Validate all lessons, challenges and scenarios, playing every solution  |
| `pnpm test:e2e`         | Build, then run Playwright (desktop + mobile, with accessibility scans) |
| `pnpm perf`             | Stress scenarios with timings (see docs/testing.md)                     |
| `pnpm format`           | Format with Prettier                                                    |

Accounts are optional. To try sign-in locally, copy `apps/web/.env.example` to
`apps/web/.env.local` and follow [docs/authentication.md](docs/authentication.md); without it
everything else works and the sign-in pages say accounts are unavailable.

Before the first `pnpm test:e2e`, install a browser:
`pnpm --filter @gitdojo/web exec playwright install chromium`.

## Monorepo structure

```text
gitdojo/
├── apps/
│   └── web/                  Next.js app (courses, challenges, playground, workspaces)
├── packages/
│   ├── git-engine/           VirtualFileSystem + GitEngine (isomorphic-git, LightningFS)
│   ├── command-parser/       tokenizer, parser, command router
│   ├── repository-state/     Git snapshot → normalized RepositoryState
│   ├── lesson-engine/        lesson schema, YAML loader, setup/reset, progress, scenarios
│   ├── challenge-engine/     challenge schema, loader, categories, availability
│   ├── validator/            state-based objective validators
│   ├── error-engine/         "Why did this happen?" explanations
│   ├── hints/                progressive hint levels and state
│   ├── progress/             local progress: XP, completions, IndexedDB storage, migration
│   ├── shared-types/         domain types shared by every package
│   ├── ui/                   design tokens and components (see UI.md)
│   └── config/               shared TypeScript, ESLint and Prettier config
├── content/
│   ├── courses/              course definitions (lesson order)
│   ├── lessons/              lesson YAML files, one directory per course
│   ├── challenges/           challenge YAML files
│   └── playground/           playground scenario YAML files
└── docs/                     architecture and contributor guides
```

## Contributing

Contributions are very welcome, and **writing a lesson is the easiest place to start**: it's a
single YAML file. See:

- [CONTRIBUTING.md](CONTRIBUTING.md): setup and workflow
- [docs/lesson-authoring.md](docs/lesson-authoring.md): how to write a lesson (and a playground
  scenario)
- [docs/challenge-authoring.md](docs/challenge-authoring.md): how to write a challenge
- [docs/validators.md](docs/validators.md): available validators and how to add one
- [docs/git-engine.md](docs/git-engine.md): how Git commands are implemented
- [docs/command-parser.md](docs/command-parser.md): how input is parsed and routed
- [docs/progress.md](docs/progress.md): local progress, XP and what counts
- [docs/authentication.md](docs/authentication.md): accounts with WSO2 Identity Platform, setup
  and console configuration
- [docs/testing.md](docs/testing.md): tests, accessibility review and performance results
- [UI.md](UI.md): the design system

## Roadmap

- [x] Monorepo, CI, design tokens
- [x] Browser virtual filesystem and Git engine (`init`, `status`, `add`, `commit`, `log`,
      `branch`, `switch`, `merge`, and the recovery commands below)
- [x] Safe command parser and router
- [x] Terminal, repository graph, working tree / staging visualization
- [x] Data-driven lessons with state-based validation, and the first-commit lesson
- [x] Courses (`/learn`): Git Basics, Branching, Merging, Merge Conflicts and Undo and Recover
- [x] Branch visualization with lanes, branch labels and HEAD
- [x] Merging (fast-forward, three-way) and hand-resolved merge conflicts
- [x] Code editor (Monaco) with file explorer and Git status letters
- [x] Playground with scenarios, persistence and snapshot export
- [x] Challenge mode: ten real-world challenges
- [x] Recovery commands: `diff`, `restore`, `rm`, `reset`, `revert`, `stash`, `cherry-pick`,
      `reflog`, `rebase`
- [x] Error explanations and progressive hints
- [x] Local progress and dashboard: completions, XP, command and hint stats, export and reset
- [x] Testing and stabilization: integration and end-to-end coverage, accessibility (WCAG AA
      scans), performance fixes
- [x] Accounts with WSO2 Identity Platform: hosted sign-in and sign-up, account menu, sign-out
- [ ] Progress that syncs across devices with an account (today it is saved in the browser)
- [ ] Remote repositories (`clone`, `fetch`, `pull`, `push`), then real GitHub

## License

[MIT](LICENSE)
