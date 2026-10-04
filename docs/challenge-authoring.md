# Challenge authoring

Challenges are real-world Git problems: a scenario, a mission and a repository that needs fixing,
with **no step-by-step instructions**. They live at `/challenges`, grouped by category, and each is
a single YAML file in `content/challenges/<id>.yaml`.

Under the hood a challenge is turned into a lesson of type `challenge`
(`toLessonDefinition` in `@gitdojo/challenge-engine`), so setup, state-based validation, sticky
and ordered progress, the terminal, editor and graph all work exactly as they do for lessons.

## Create a challenge

1. **Create `content/challenges/<id>.yaml`.** The `id` must match the file name and be unique
   among challenges (lowercase letters, digits and dashes). It is also the URL:
   `/challenges/<id>`.
2. **Write the scenario and mission.** The scenario is what happened; the mission is the outcome
   wanted. Neither says which commands to run.
3. **Build the starting state** with `setup`, exactly as for lessons (see
   [lesson-authoring.md](./lesson-authoring.md#setup-with-history)): files, commits per branch,
   file deletions (`path: null`), the starting branch and setup `commands`.
4. **Describe success as state.** `objectives` are the success conditions, each a validator (see
   [validators.md](./validators.md)). List them in an order that rejects wrong routes: an
   objective only completes once every earlier one has.
5. **Add a solution and run the tests:**

   ```bash
   pnpm --filter @gitdojo/challenge-engine test
   ```

   `src/challenges.test.ts` loads every challenge, plays each playable one's solution from
   `SOLUTIONS` through the real parser, Git engine and validators, and checks it does not start
   solved. Add a solution for every new challenge, and a wrong route to "rejects wrong routes" when
   there is an obvious one.

## Reference

```yaml
id: detached-head # also the file name and URL
title: Detached HEAD
category: branching # basics | branching | merging | conflicts | recovery | history | advanced
difficulty: intermediate # beginner | intermediate | advanced
order: 2 # optional; position within the category

scenario: | # what happened; supports paragraphs, `code` and **bold**
  Yesterday you checked out an old commit and committed a fix right there.

mission: > # what to achieve, never how
  Make sure both commits survive on a branch called `fix/rounding`, then get back to `main`.

concepts: [detached-head, branches] # at least one; shown on the card
requires: [switch] # optional; Git commands the challenge needs (see "Locked challenges")

setup: # same fields as a lesson's setup
  initializeGit: true
  commits:
    - message: Initial commit
      files: { README.md: "# Checkout\n" }
  commands:
    - git switch --detach HEAD

objectives: # the success conditions, at least one
  - id: fix-kept
    description: "`fix/rounding` contains the rounding fix."
    validator:
      type: branch_contains_commit
      branch: fix/rounding
      message: Fix rounding of totals

hints: # optional; objective id → hints, vague first
  fix-kept:
    - A new branch starts wherever HEAD is when you create it.
```

Every challenge earns the same XP (100), awarded once; see [Local progress](progress.md#xp).

The schema is strict: unknown keys, unknown categories or validator types, missing missions and
empty `concepts` or `objectives` are rejected, and setup and hint keys are checked like lessons'.

## Locked challenges

`requires` lists the Git commands a challenge depends on, by name (`reset`, `stash`,
`cherry-pick`...). A challenge whose commands GitDojo cannot run yet is shown as **Coming soon**
and its page explains what is missing; it unlocks automatically once the command is implemented
(`isSupportedGitCommand` in `@gitdojo/command-parser`). Locked challenges need no solution in the
tests until then.

## Writing good challenges

- **One problem people really hit.** "I committed to the wrong branch" beats "use command X".
- **Never prescribe commands**, not even in hints. Hints point at concepts and at what to look
  at ("`git status` lists every file that still needs a decision"). Challenge hints are levelled
  like lesson hints, but never reach level 3: plain strings stop at level 2, and an explicit
  `level: 3` is rejected by the schema. The "Why did this happen?" panel also hides its command
  suggestions in challenges.
- **Accept every reasonable route.** Check outcomes (a branch contains a commit, the working tree
  is clean), not the exact shape of history, unless the shape is the point.
- **Make wrong routes fail.** If committing a file instead of ignoring it is a mistake, add an
  objective that catches it (`file_not_tracked` before `clean_worktree`).
