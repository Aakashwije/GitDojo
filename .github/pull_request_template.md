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
- [ ] Hints go from gentle to explicit, and no hint gives the answer away too early
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
- [ ] Uses the design tokens and direction from `UI.md`, with no hard-coded colours
- [ ] Works in light and dark mode
- [ ] Responsive down to mobile width
- [ ] ♿ Keyboard navigable, visible focus states, labelled controls, sufficient contrast
- [ ] Loading, empty and error states handled

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
<summary><b>⚡ Performance-sensitive changes</b> (terminal, graph rendering, engine hot paths)</summary>

- [ ] Ran `pnpm perf` and stayed within the latency budgets in `docs/testing.md`
- [ ] For graph rendering: ran `pnpm --filter @gitdojo/web perf:browser`
- [ ] No new large dependencies in the client bundle

</details>

## 💬 Notes for reviewers

<!-- Trade-offs, alternatives you rejected, follow-ups, open questions. -->
