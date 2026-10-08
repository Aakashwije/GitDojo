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
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
pnpm validate:content    # every lesson, course, challenge and scenario
pnpm test:e2e            # builds the app and runs Playwright (desktop + mobile, with axe scans)
```

The first `test:e2e` run needs a browser: `pnpm --filter @gitdojo/web exec playwright install chromium`.

`pnpm test:e2e` starts its own server with accounts and the database switched off, as CI does, so
your `.env.local` does not change what the tests see.

## Pull request checklist

Everything below is enforced by the test suite or by review, and the
[pull request template](.github/pull_request_template.md) repeats it as tick-boxes. Say in the PR
description what you ran, and what you left out and why.

**Any change**

- [ ] The commands above pass. If something is blocked (no PostgreSQL, say), name it in the
      description rather than leaving it unsaid.
- [ ] Tests live next to the code they cover, and existing `data-testid` attributes stay put: the
      Playwright specs select on them.
- [ ] The architectural rules in [docs/architecture.md](docs/architecture.md) still hold. Several
      are enforced by ESLint (feature layers, SDK facades, the `WorkspaceSession` pipeline), so a
      violation fails CI rather than review.

**Adding or changing a lesson**

- [ ] The lesson is YAML in `content/lessons/<course>/`, listed by `content/courses/<course>.yaml`.
      Every file in a course directory must be listed, and lesson ids are unique across all
      courses. See [docs/lesson-authoring.md](docs/lesson-authoring.md).
- [ ] Interactive lessons and challenges have a reference solution in `SOLUTIONS`
      (`packages/lesson-engine/src/content.test.ts`); it is replayed through the real parser,
      engine and validators.
- [ ] No objective passes before the learner has typed anything: a lesson must never start
      completed.
- [ ] Hints climb concept → command → answer. A level 3 hint names the command in backticks, and
      challenges never give the answer away.
- [ ] Adding or removing a course also updates the course-order assertion in `content.test.ts`.
- [ ] Only teach a command the sandbox can actually run. If the parser does not support it yet
      (see `PLANNED_GIT_COMMANDS`), either implement it first or write a `concept` lesson that says
      so in a `note` callout — do not write objectives a learner cannot satisfy.

**Changing the lesson UI**

- [ ] The UI stays generic and data-driven. No lesson-specific conditionals, and no lesson copy
      hardcoded in React: a new lesson using the supported YAML fields should benefit
      automatically.
- [ ] New YAML fields or content block types are a last resort. If one is genuinely needed, say
      why in the description, and keep it backward compatible: schema
      (`packages/lesson-engine/src/content-schema.ts`), types (`@gitdojo/shared-types`), renderer
      and [docs/lesson-authoring.md](docs/lesson-authoring.md) all change together.
- [ ] Existing lesson routes, ids, objectives, validators, completion behaviour, saved progress
      and XP rules are unchanged.

**Accessibility**

The axe scans in `accessibility.spec.ts` catch a lot, but not everything. See the review in
[docs/testing.md](docs/testing.md#accessibility-review) for what has already been fixed, and:

- [ ] Semantic HTML, a visible focus ring on everything reachable by keyboard, and an accessible
      name on every control.
- [ ] State is carried by text or an icon as well as colour, and changes a learner should notice
      (an objective completing, a demo step, a validator's feedback) are announced through a
      status region.
- [ ] Colour comes from the tokens in `packages/ui/src/styles/theme.css`. Use `--text-muted` for
      text; `--text-faint` is for icons, markers and rules only.
- [ ] The layout works at phone width, not only on a desktop. The `mobile` Playwright project runs
      the whole suite on a Pixel 7 profile.
- [ ] Movement respects `prefers-reduced-motion` (the theme disables animation globally, so use
      the `animate-gd-*` utilities rather than hand-rolled transitions).

**Performance**

- [ ] If the change adds a cost that grows with repository size, content size or how often
      something re-renders, add a scenario to `apps/web/perf/` with a budget in
      `perf/harness.ts`, and record the measurement in
      [docs/testing.md](docs/testing.md#performance). Budgets are roughly 10–30× a laptop's time,
      so they catch an order-of-magnitude regression, not slower CI.
- [ ] Run what you added: `pnpm perf`, and `pnpm --filter @gitdojo/web perf:browser` for a browser
      scenario. CI runs these weekly and on request, not on every PR.
- [ ] Avoid new dependencies. If one is unavoidable, justify it in the description.

## Where things live

- **Lessons:** `content/lessons/<course>/*.yaml`, listed by `content/courses/<course>.yaml`. See
  [docs/lesson-authoring.md](docs/lesson-authoring.md).
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
