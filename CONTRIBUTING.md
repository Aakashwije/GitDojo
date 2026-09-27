# Contributing to GitDojo

Thanks for helping people learn Git! Contributions of every size are welcome: lessons, bug fixes,
features, docs and design.

## Getting started

```bash
corepack enable          # provides the pinned pnpm version
pnpm install
pnpm dev                 # http://localhost:3000
```

Before opening a pull request, run:

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e            # builds the app and runs Playwright
```

The first `test:e2e` run needs a browser: `pnpm --filter @gitdojo/web exec playwright install chromium`.

## Where things live

- **Lessons:** `content/lessons/*.yaml`. See [docs/lesson-authoring.md](docs/lesson-authoring.md).
- **Validators:** `packages/validator`. See [docs/validators.md](docs/validators.md).
- **Git commands:** `packages/git-engine` and `packages/command-parser`. See
  [docs/git-engine.md](docs/git-engine.md).
- **UI:** `apps/web` and `packages/ui`. Design tokens and visual direction come from
  [UI.md](UI.md).

Read [docs/architecture.md](docs/architecture.md) first. It explains the rules that keep the
codebase modular (for example: only `git-engine` may import isomorphic-git, and validators check
repository state, never command text).

## Code style

- TypeScript strict mode; no `any`, no `@ts-ignore`, no silent `catch` blocks.
- Small, focused modules with tests next to the code (`*.test.ts`).
- Comments explain _why_, not _what_.
- Prettier formats everything: `pnpm format`.
