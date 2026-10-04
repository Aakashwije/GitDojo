# Testing and stabilization

How GitDojo is tested, how to run the checks, and what the Phase 22 stabilization pass found: the
accessibility review and the performance scenarios with their measurements.

## Running the checks

| Command                                   | What it runs                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                       | Prettier                                                                                             |
| `pnpm lint`                               | ESLint in every package                                                                              |
| `pnpm typecheck`                          | `tsc --noEmit` in every package                                                                      |
| `pnpm test`                               | Unit and integration tests (Vitest) in every package                                                 |
| `pnpm validate:content`                   | Every lesson, course, challenge and scenario: schema, references, and each reference solution played |
| `pnpm build`                              | Production build (also loads and validates all content)                                              |
| `pnpm test:e2e`                           | Build, then Playwright on desktop Chrome and a Pixel 7 profile, including axe accessibility scans    |
| `pnpm perf`                               | Stress scenarios in Node (not part of CI; prints a timing table)                                     |
| `pnpm --filter @gitdojo/web perf:browser` | The commit-graph scenario in a real browser (needs a build, like e2e)                                |

Install a browser once before the first e2e run:
`pnpm --filter @gitdojo/web exec playwright install chromium`.

GitHub Actions (`.github/workflows/ci.yml`) runs format, lint, typecheck, unit and integration
tests, content validation, the production build and the Playwright suite on every push and pull
request. Playwright browsers are cached per Playwright version; on failure the HTML report and the
traces from `test-results/` are uploaded as an artifact.

## What is tested where

Unit and integration tests run in Node (packages) or jsdom (web), against an in-memory IndexedDB
(`fake-indexeddb`), so the real Git engine and LightningFS run in every test.

| Suite                       | Tests | Covers                                                                                                                                                                                                                                         |
| --------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@gitdojo/git-engine`       |   192 | Every command and its errors: init → commit, branches and detached HEAD, fast-forward/three-way merges and conflicts, diff, restore, soft/mixed/hard reset, revert, stash, cherry-pick, reflog, rebase, rm; status classification; path safety |
| `@gitdojo/command-parser`   |    59 | Tokenizer, parser (flags, `--`, usage errors), router flows end to end, the `gitCommand` usage tag                                                                                                                                             |
| `@gitdojo/repository-state` |    10 | Snapshot → `RepositoryState`: files, staging, commits, branches, merges in progress                                                                                                                                                            |
| `@gitdojo/validator`        |    59 | Every validator against real repository states                                                                                                                                                                                                 |
| `@gitdojo/lesson-engine`    |    79 | Schema and parsing, setup/reset, sticky ordered progress, and every lesson's reference solution plus alternative and wrong routes                                                                                                              |
| `@gitdojo/challenge-engine` |    22 | Schema, availability, and every challenge solved through the engine (and not completed when solved the wrong way)                                                                                                                              |
| `@gitdojo/error-engine`     |    14 | Explanations for command outcomes, with causes drawn from repository state                                                                                                                                                                     |
| `@gitdojo/hints`            |    10 | Hint levels, ladder validation, reveal state                                                                                                                                                                                                   |
| `@gitdojo/progress`         |    34 | XP once per item, no double rewards, command and unique hint counting, course progress, continue learning, migration (repeatable), malformed data, reload, concurrent tabs, batching, storage failures, newer schemas, reset scope, export     |
| `@gitdojo/web`              |   124 | Terminal controller and line editor, editor controller, graph layout, components, learning sessions, and the progress flow below                                                                                                               |

The **progress flow** test (`apps/web/features/progress/progress-flow.test.tsx`) drives the real
`useLearningSession` and `useLessonProgress` hooks: terminal input → parser → Git engine →
repository state → validators → completion → progress store → storage. It checks command counting
by outcome, XP awarded once across "Practice again", standalone challenges recorded as challenges,
no completion from the wrong repository state, reload, and a failing save that leaves learning
working with a visible notice. It also guards against a bug found while writing it: the demo lesson
and the `first-commit` challenge share an id, and the challenge workspace briefly saw the lesson's
completed state; completion now counts only from the workspace's own evaluation.

### End-to-end (Playwright)

| Spec                              | Workflows                                                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-commit.spec.ts`            | First-commit lesson end to end, state-based validation (`git add .`), lesson reset                                                                                                                                           |
| `courses.spec.ts`                 | Concept lessons and course progress, visual demos, a branching lesson (feature-branch commit)                                                                                                                                |
| `merging.spec.ts`                 | Fast-forward merge, resolving a conflict in the conflict editor                                                                                                                                                              |
| `editor.spec.ts`                  | Editing and saving a file (becomes modified), creating a file                                                                                                                                                                |
| `recovery.spec.ts`                | Reflog recovery, stash, diff                                                                                                                                                                                                 |
| `playground.spec.ts`              | Playground persistence across reload, scenarios, reset, snapshot export                                                                                                                                                      |
| `challenges.spec.ts`              | Solving a standalone challenge and seeing it remembered                                                                                                                                                                      |
| `hints.spec.ts`, `errors.spec.ts` | The hint ladder and error explanations                                                                                                                                                                                       |
| `progress.spec.ts`                | Whole Git Basics course → dashboard totals (450 XP); replay without duplicate XP; reload; standalone challenge; unique hint usage (via export); reset keeps the playground; legacy migration; continue learning; empty state |
| `accessibility.spec.ts`           | axe WCAG 2.1 A/AA scans of every main page and dialog, focus trapping and return, mobile navigation                                                                                                                          |

Tests share helpers in `e2e/helpers.ts`, wait on visible state rather than sleeping, and each
gets a fresh browser context (empty IndexedDB and localStorage). Before reloading or leaving a
page right after activity, tests wait for `<html data-progress="saved">`, which the app sets once
progress writes have landed. The full suite passed three times in a row (`--repeat-each=3`, 222
runs) with no flakes.

## Accessibility review

The learning, challenge, playground and dashboard flows were reviewed by hand and with axe
(`@axe-core/playwright`, WCAG 2.1 A and AA, run with reduced motion so text is measured at rest).
xterm.js and Monaco are excluded from the scans as third-party widgets; the terminal keeps its
screen-reader announcements.

| Issue found                                                                                 | Fix                                                                                                         |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| White text on the accent colour (primary buttons, HEAD label) was 3.07:1                    | New `--accent-strong` (#4a67e0) for filled backgrounds: 4.88:1. The lighter accent stays for text and focus |
| Muted text on elevated surfaces (badges) was 4.43:1                                         | `--text-muted` #7c8593 → #8a93a1: at least 4.9:1 on every surface                                           |
| The "faint" tone was used for text at 3.5:1                                                 | Text now uses the muted tone; faint is for icons and markers only, raised to ≥ 3.4:1                        |
| Lesson pager "Next" label (white at 80%) and the footer logo (80% opacity) were below 4.5:1 | Full opacity                                                                                                |
| React Flow's attribution link was 4.3:1                                                     | Themed colours                                                                                              |
| Dialogs opened from state (reset, lesson complete) did not return focus when closed         | `DialogContent` remembers the focused element and restores it                                               |
| No site navigation on phones: the header links were hidden below 640px                      | A menu button (`aria-expanded`, Escape closes and returns focus)                                            |
| Several course progress bars on one page shared the name "Course progress"                  | Each bar is named after its course and has `aria-valuetext` ("3 of 10 lessons")                             |

Also checked: every interactive element is reachable by keyboard with a visible focus ring;
dialogs trap focus and close with Escape; objective, lesson, challenge and course states pair
colour with an icon and text (or screen-reader text); progress notices, completions and dashboard
actions are announced through status regions; layouts work at phone width (Pixel 7 project); and
animations are disabled under `prefers-reduced-motion`.

## Performance

`apps/web/perf/scenarios.perf.ts` runs the hot paths at well beyond lesson size and checks the
results are still correct (ordering, the latest edit saved, counts). There are no time limits:
numbers depend on the machine. Measured on an Apple Silicon laptop, Node 24, `fake-indexeddb`;
"Before" is the same scenario before the fixes described below:

| Scenario                              | Size                             | Before (ms) | After (ms) |
| ------------------------------------- | -------------------------------- | ----------: | ---------: |
| Create commits (`git add` + commit)   | 300 commits                      |        2357 |       2348 |
| Read repository state                 | 300 commits                      |         259 |     **76** |
| `git log --oneline`                   | 300 commits                      |          66 |         65 |
| `git log --all --oneline`             | 300 commits, 6 branches          |         210 |     **69** |
| Build commit graph (React Flow nodes) | 300 commits                      |           8 |          8 |
| `git reflog`                          | 605 entries                      |           3 |          2 |
| `git status`, all untracked           | 500 files                        |          22 |         22 |
| `git add .`                           | 500 files                        |         506 |    **176** |
| `git commit`                          | 500 files                        |          16 |         17 |
| `git status`, 50 modified             | 500 files                        |          15 |         17 |
| Read repository state                 | 500 files, 50 modified           |          16 |         16 |
| `git diff`                            | 50 modified files                |          29 |         28 |
| Assign graph lanes                    | 5000 commits                     |         1.6 |        1.6 |
| Parse and validate lesson YAML        | 72 KB, 400 blocks, 60 objectives |          28 |         29 |
| Queued edit + add + commit rounds     | 60 rounds (180 operations)       |        2661 |   **1803** |
| Typing with autosave, then flush      | 500 keystrokes                   |          70 |         75 |
| Progress updates, each awaited        | 200 updates                      |          14 |         14 |
| Progress updates, burst               | 1000 updates                     |         0.7 |        0.7 |

`git add .` scaling, before → after: 125 files 143 → 75 ms, 250 files 223 → 93 ms, 500 files
567 → 201 ms, 1000 files 1411 → 541 ms.

In a real browser (`perf/graph-render.pw.ts`, production build, Chromium), from pressing Enter on
a command to its commit being drawn in the graph:

| Browser scenario        | Size        |    ms |
| ----------------------- | ----------- | ----: |
| Command → graph updated | 50 commits  |    85 |
| Command → graph updated | 100 commits |    98 |
| Command → graph updated | 150 commits |   108 |
| Select a commit         | 50–150      | 12–31 |

### Bottlenecks fixed

- **Reading history once per snapshot.** The snapshot taken after every command walked HEAD's
  history twice and then each branch's full history again with `git.log`, so a shared trunk was
  read once per branch (about 1300 commit reads for 300 commits and 6 branches). History walks now
  share a per-snapshot commit cache while keeping exactly isomorphic-git's order: 3.4× faster
  state reads, and `git log --all` 3× faster.
- **`git add` updated the index once per file.** Each call rewrote the whole index; all additions
  now go through one isomorphic-git call (2–3× faster).
- **One transaction per progress update.** A burst of activity (several commands, then a
  completion) queued one IndexedDB transaction each, which also widened the window in which
  leaving the page could lose the latest change (an e2e test caught this). Updates made while a
  save is running are now batched into the next transaction.

Also verified: commands typed faster than they run execute in order (typeahead buffering plus the
session queue); rapid editor typing with overlapping autosaves always persists the final text;
lane assignment and graph building stay in single-digit milliseconds. Not optimized, because no
problem was shown: per-command state reads grow with history, but lessons stay far below the
sizes measured here.
