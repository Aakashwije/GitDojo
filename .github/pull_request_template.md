<!--
  Thanks for contributing to GitDojo! 🥋

  PR title: use Conventional Commits, e.g. `feat(lessons): add rebase course`,
  `fix(git-engine): handle detached HEAD`, `docs: explain validators`.

  Keep PRs small and focused. If this is over ~400 changed lines (excluding lockfiles and
  content YAML), consider splitting it. Delete any section that doesn't apply.
-->

## 🎯 Summary

<!-- What does this change and WHY? Lead with the user-facing outcome, not the implementation. -->

Closes #

## 🧩 Type of change

- [ ] 🐛 Bug fix (non-breaking, fixes an issue)
- [ ] ✨ Feature (non-breaking, adds behaviour)
- [ ] 💥 Breaking change (changes existing behaviour, saved progress, lesson IDs or public APIs)
- [ ] 📚 Content: lesson / course / challenge (`content/`)
- [ ] 🎨 UI / design (`apps/web`, `packages/ui`)
- [ ] ⚙️ Engine: git-engine / command-parser / validator / lesson- or challenge-engine
- [ ] 🔐 Auth / accounts / database
- [ ] ⚡ Performance
- [ ] 🔒 Security
- [ ] 📝 Docs
- [ ] 🧹 Refactor / chore / CI / dependencies

## 🔍 What changed

<!-- The notable changes, grouped by package. Point reviewers at the trickiest part. -->

-

**Start reviewing at:** <!-- e.g. `packages/validator/src/branch.ts`, it holds the core logic -->

## 🧪 How to test

<!-- Exact steps a reviewer can follow. For learner-facing changes, name the lesson and the commands to type. -->

1. `pnpm dev` and open `http://localhost:3000/...`
2.
3. **Expected:**

## 📸 Screenshots / recordings

<!-- Required for UI changes. Show before and after, light and dark, and mobile width if layout changed. -->

| Before | After |
| ------ | ----- |
|        |       |

## ⚖️ Risk and impact

**Risk level:** <!-- 🟢 Low · 🟡 Medium · 🔴 High, with a one-line reason -->

- **Who is affected:** <!-- learners, lesson authors, signed-in users, contributors -->
- **Breaking changes / migrations:** <!-- None, or describe. Saved local progress, lesson IDs, DB schema (`pnpm db:migrate`)? -->
- **Rollback plan:** <!-- Usually "revert this PR". Say so if a migration or data change makes that unsafe. -->

## ✅ Checklist

### Always

- [ ] PR title follows Conventional Commits
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass locally
- [ ] `pnpm format:check` passes
- [ ] Tests added or updated next to the code (`*.test.ts`), including the failure case for bug fixes
- [ ] No `any`, `@ts-ignore` or silent `catch` blocks
- [ ] Comments explain _why_, not _what_
- [ ] Docs in `docs/` updated if behaviour, architecture or authoring changed
- [ ] I've reviewed my own diff and removed debug code

<details>
<summary><b>📚 Content changes</b> (lessons, courses, challenges)</summary>

- [ ] `pnpm validate:content` passes
- [ ] Followed `docs/lesson-authoring.md` / `docs/challenge-authoring.md`
- [ ] Played through the lesson end to end in the browser
- [ ] Objectives check repository state, so alternative valid commands (e.g. `git add .` vs `git add file`) also pass
- [ ] Hints climb concept → command → answer; a level 3 hint names the command in backticks, and
      challenges never give the answer away
- [ ] Interactive lessons and challenges have a reference solution in `SOLUTIONS`
      (`packages/lesson-engine/src/content.test.ts`)
- [ ] No objective passes before the learner has typed anything: the lesson never starts completed
- [ ] Every lesson file in a course directory is listed by the course; adding or removing a course
      also updates the course-order assertion in `content.test.ts`
- [ ] The lesson only teaches commands the sandbox can run. If the parser does not support one yet
      (`PLANNED_GIT_COMMANDS`), it is a `concept` lesson that says so in a `note` callout
- [ ] Existing lesson IDs unchanged, so learners' saved progress still works

</details>

<details>
<summary><b>⚙️ Engine changes</b> (git-engine, command-parser, validator)</summary>

- [ ] Only `git-engine` imports isomorphic-git (see `docs/architecture.md`)
- [ ] Validators check repository state, never command text
- [ ] Behaviour matches real Git (compared against `git` CLI output where relevant)
- [ ] Error messages are plain words and go through `error-engine`
- [ ] Edge cases covered: empty repo, detached HEAD, conflicts, unborn branch

</details>

<details>
<summary><b>🎨 UI changes</b></summary>

- [ ] `pnpm test:e2e` passes
- [ ] Uses the design tokens and direction from `docs/ui.md`, with no hard-coded colours
- [ ] Works in light and dark mode
- [ ] Responsive down to mobile width
- [ ] ♿ Keyboard navigable, visible focus states, labelled controls, sufficient contrast
- [ ] State is carried by text or an icon as well as colour, and changes a learner should notice
      are announced through a status region
- [ ] `--text-muted` for text; `--text-faint` is for icons, markers and rules only
- [ ] Movement goes through the `animate-gd-*` utilities, so `prefers-reduced-motion` is respected
- [ ] Loading, empty and error states handled

**Lesson UI only**

- [ ] Stays generic and data-driven: no lesson-specific conditionals, and no lesson copy hardcoded
      in React. A new lesson using the supported YAML fields benefits automatically
- [ ] Lesson routes, IDs, objectives, validators, completion behaviour, saved progress and XP
      rules are unchanged
- [ ] Any new YAML field or content block type is justified in the description, backward
      compatible, and lands together with the schema, `@gitdojo/shared-types`, the renderer and
      `docs/lesson-authoring.md`

</details>

<details>
<summary><b>🔐 Auth, data and security</b></summary>

- [ ] No secrets, tokens or personal data in code, logs or screenshots
- [ ] User input is validated and output is escaped (no XSS, open redirects or injection)
- [ ] Auth flows still work, as described in `docs/authentication.md`
- [ ] DB migrations are additive and reversible, or the rollback plan above explains why not
- [ ] New dependencies are necessary, maintained and licence-compatible with MIT

</details>

<details>
<summary><b>⚡ Performance-sensitive changes</b> (terminal, graph rendering, lesson UI, engine hot paths)</summary>

- [ ] Ran `pnpm perf` and stayed within the latency budgets in `docs/testing.md`
- [ ] For anything rendered: ran `pnpm --filter @gitdojo/web perf:browser`
- [ ] A cost that grows with repository size, content size or re-render frequency has its own
      scenario in `apps/web/perf/`, a budget in `perf/harness.ts`, and its measurement recorded in
      `docs/testing.md`
- [ ] No new large dependencies in the client bundle

</details>

<!-- CONTRIBUTING.md explains the reasoning behind these boxes, with links to the docs. -->

## 💬 Notes for reviewers

<!-- Trade-offs, alternatives you rejected, follow-ups, open questions. -->
