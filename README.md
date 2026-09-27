<div align="center">

# GitDojo

**Learn Git by doing.**

_Learn it. Break it. Fix it. Master it._

</div>

GitDojo is an open-source interactive Git learning environment where developers learn Git by typing
real commands, manipulating safe browser-based repositories, and visualizing what happens
internally.

> **Status: early development.** The first vertical slice works end to end: a guided lesson, a
> browser terminal, a real Git engine, live working tree / staging / history visualization, and
> state-based objective validation. Accounts, persistence, more commands and more lessons are on
> the [roadmap](#roadmap).

## What it does today

Open the demo lesson at `/learn/demo` ("Your First Commit"):

1. A virtual repository is created in your browser with a `README.md`.
2. You type `git status`, `git init`, `git add README.md` and `git commit -m "Initial commit"` into
   a real terminal.
3. Watch `README.md` move from **Working Tree** to **Staging Area**, and a commit appear in the
   **Repository Graph** with `main` and `HEAD` labels.
4. Objectives tick off as the repository reaches the right state. `git add .` works just as well
   as `git add README.md`, because GitDojo checks the result, not the command.

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
pnpm dev            # http://localhost:3000, then open /learn/demo
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
│   └── web/                  Next.js app (landing page, /learn/demo workspace)
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
│   ├── lessons/              lesson YAML files
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
- [x] Browser virtual filesystem and Git engine (`init`, `status`, `add`, `commit`, `log`)
- [x] Safe command parser and router
- [x] Terminal, repository graph, working tree / staging visualization
- [x] Data-driven lessons with state-based validation, and the first-commit lesson
- [ ] More commands: `diff`, `restore`, `rm`, `branch`, `switch`, `merge`
- [ ] Built-in file editor, so learners can modify files and see `modified` states
- [ ] Course structure (`/learn`) with more lessons
- [ ] Branching and merge visualization, conflicts
- [ ] Real-world challenges ("you committed to the wrong branch...")
- [ ] Playground mode and command reference
- [ ] Accounts and progress persistence

## License

[MIT](LICENSE)
