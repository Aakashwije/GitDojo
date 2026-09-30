<div align="center">

<img src="docs/assets/gitdojo-banner.png" alt="GitDojo" width="640" />

# GitDojo

**Learn Git by doing.**

_Learn it. Break it. Fix it. Master it._

</div>

GitDojo is an open-source interactive Git learning environment where developers learn Git by typing
real commands, manipulating safe browser-based repositories, and visualizing what happens
internally.

> **Status: early development.** Four courses, from Git Basics to Merge Conflicts, run end to end:
> concept lessons with visual demos, hands-on lessons and challenges in a browser terminal, a real
> Git engine, live working tree / staging / branch graph visualization, and state-based objective
> validation. Accounts, more commands and more courses are on the [roadmap](#roadmap).

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

Everything runs locally in the browser: Git is [isomorphic-git](https://isomorphic-git.org), files
live in IndexedDB via [LightningFS](https://github.com/isomorphic-git/lightning-fs), and there is
no real shell anywhere.

## Architecture

```text
Terminal (xterm.js)
  → Command Parser      tokenize + parse; unsupported programs never execute
  → Command Router      ParsedCommand → GitEngine
  → GitEngine           the only module that imports isomorphic-git
  → Virtual Filesystem  LightningFS + IndexedDB, one isolated directory per lesson
  → Repository State    normalized model: files, staged files, commits, branches
  → Validator Engine    lesson objectives checked against repository state
  → UI                  Zustand stores → React panels and React Flow graph
```

See [docs/architecture.md](docs/architecture.md) for the full picture, including the safety model.

## Tech stack

| Area          | Choice                                                       |
| ------------- | ------------------------------------------------------------ |
| App           | Next.js 16 (App Router), React 19, TypeScript (strict)       |
| Styling       | Tailwind CSS 4, shadcn/ui-style components on Radix          |
| Terminal      | xterm.js                                                     |
| Git           | isomorphic-git                                               |
| Filesystem    | LightningFS on IndexedDB                                     |
| Visualization | React Flow                                                   |
| State         | Zustand                                                      |
| Content       | YAML lessons validated with Zod                              |
| Tests         | Vitest, React Testing Library, Playwright                    |
| Tooling       | pnpm workspaces, Turborepo, ESLint, Prettier, GitHub Actions |

## Local development

Requirements: Node.js 20.9+ (24 recommended, see `.nvmrc`) and pnpm via Corepack.

```bash
corepack enable
pnpm install
pnpm dev            # http://localhost:3000, then open /learn
```

| Command          | What it does                                   |
| ---------------- | ---------------------------------------------- |
| `pnpm dev`       | Start the web app in development mode          |
| `pnpm build`     | Production build (also validates every lesson) |
| `pnpm lint`      | ESLint across all packages                     |
| `pnpm typecheck` | `tsc --noEmit` across all packages             |
| `pnpm test`      | Unit tests (Vitest) across all packages        |
| `pnpm test:e2e`  | Build, then run Playwright (desktop + mobile)  |
| `pnpm format`    | Format with Prettier                           |

Before the first `pnpm test:e2e`, install a browser:
`pnpm --filter @gitdojo/web exec playwright install chromium`.

## Monorepo structure

```text
gitdojo/
├── apps/
│   └── web/                  Next.js app (landing page, courses, lesson workspace)
├── packages/
│   ├── git-engine/           VirtualFileSystem + GitEngine (isomorphic-git, LightningFS)
│   ├── command-parser/       tokenizer, parser, command router
│   ├── repository-state/     Git snapshot → normalized RepositoryState
│   ├── lesson-engine/        lesson schema, YAML loader, setup/reset, progress
│   ├── validator/            state-based objective validators
│   ├── shared-types/         domain types shared by every package
│   ├── ui/                   design tokens and components (see UI.md)
│   └── config/               shared TypeScript, ESLint and Prettier config
├── content/
│   ├── courses/              course definitions (lesson order)
│   ├── lessons/              lesson YAML files, one directory per course
│   └── challenges/           (coming later)
└── docs/                     architecture and contributor guides
```

## Contributing

Contributions are very welcome, and **writing a lesson is the easiest place to start**: it's a
single YAML file. See:

- [CONTRIBUTING.md](CONTRIBUTING.md): setup and workflow
- [docs/lesson-authoring.md](docs/lesson-authoring.md): how to write a lesson
- [docs/validators.md](docs/validators.md): available validators and how to add one
- [docs/git-engine.md](docs/git-engine.md): how Git commands are implemented
- [UI.md](UI.md): the design system

## Roadmap

- [x] Monorepo, CI, design tokens
- [x] Browser virtual filesystem and Git engine (`init`, `status`, `add`, `commit`, `log`,
      `branch`, `switch`, `merge`)
- [x] Safe command parser and router
- [x] Terminal, repository graph, working tree / staging visualization
- [x] Data-driven lessons with state-based validation, and the first-commit lesson
- [x] Courses (`/learn`): Git Basics, Branching, Merging and Merge Conflicts, with saved progress
- [x] Branch visualization with lanes, branch labels and HEAD
- [x] Merging (fast-forward, three-way) and hand-resolved merge conflicts
- [ ] More commands: `diff`, `restore`, `rm`, `rebase`
- [ ] General file editor (today only conflicted files can be edited), so learners can see
      `modified` states
- [ ] Real-world challenges ("you committed to the wrong branch...")
- [ ] Playground mode and command reference
- [ ] Accounts, and progress that syncs across devices (today it is saved in the browser)

## License

[MIT](LICENSE)
