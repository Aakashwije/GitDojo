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

tips: # optional; feedback for states that lead away from the mission (see "Mistake tips")
  - id: left-detached
    when: # every condition must pass, written exactly like an objective's validator
      - type: current_branch
        branch: main
      - type: branch_not_exists
        branch: fix/rounding
    text: >-
      You are on `main` and `fix/rounding` does not exist, so nothing points at the rounding work
      any more.
```

Every challenge earns the same XP (100), awarded once; see [Local progress](progress.md#xp).

The schema is strict: unknown keys, unknown categories or validator types, missing missions and
empty `concepts` or `objectives` are rejected, and setup and hint keys are checked like lessons'.

## Mistake tips

Objectives say whether the learner is finished. `tips` say what is _off_ about where they are now:
one short, factual note about the state they are in, shown in the lesson panel under **Worth
checking**.

```yaml
tips:
  - id: main-moved # unique within the challenge; name it after the state, not the command
    when: # every condition must pass; the same validators objectives use
      - type: branch_contains_commit
        branch: main
        message: Send receipt emails
    text: >-
      `main` now contains `Send receipt emails`. The mission leaves `main` exactly where it was,
      and what `main` points at now shows what moved.
```

| Field  | Meaning                                                                              |
| ------ | ------------------------------------------------------------------------------------ |
| `id`   | Unique within the challenge. Names the state (`main-moved`), not the command.        |
| `when` | One or more [validators](./validators.md). The tip shows while **every** one passes. |
| `text` | One or two sentences. Supports paragraphs, `code` and **bold**, like a scenario.     |

**How they behave.** Tips are evaluated from scratch after every command and every file save, and
nothing about them is sticky: a tip appears the moment its conditions hold and is gone as soon as
they stop. Only the **first** matching tip is shown, so order them with the most specific first — a
learner who has gone two ways wrong reads one note, not a list. Nothing shows before the learner's
first action, or once the challenge is solved.

**Rules the schema enforces.** Tip ids are unique, `when` needs at least one condition, and a
challenge's tip text may no more name a command in backticks than a hint may. `tips` is optional:
a challenge without any behaves exactly as before.

### Writing a tip that is actually true

A tip is a claim about repository state, and the app only sees state — never which command
produced it, or what the learner meant. So:

- **Describe the state, not the action.** "The fix commit is on `main`; this challenge expects it
  on `fix/rounding`" is checkable. "You committed to the wrong branch" is a guess: the commit could
  have arrived by a merge, a cherry-pick or a reset.
- **Point somewhere, do not instruct.** Name the concept and what is worth looking at ("comparing
  the two branch tips shows the gap"), and leave the command to the learner.
- **Make it false at the start.** A condition that already holds when the challenge loads is not
  feedback, it is a restatement of the mission. `challenges.test.ts` plays every reference solution
  and fails if any tip matches at any point along it, including the starting state.
- **Make it reachable, and make it go away.** A tip can only be seen while the challenge is
  unsolved, so check that the state it describes is possible _before_ the last objective passes.
  Add the wrong route to `MISTAKES` in `challenges.test.ts`: the test plays it, requires that tip to
  be the first match, and requires the challenge not to be solved.

### What tips cannot see

Some mistakes are invisible to the current repository model, and a tip must not guess at them:

- **How a conflict was resolved.** `ConflictState` records only whether the markers are gone and
  the file is staged, so "you kept the old host" or "you staged the file with the markers still in
  it" cannot be told apart from a correct resolution. Detecting either would need the resolved
  content in the state, or a validator that matches a file's contents.
- **Which command produced a state.** The reflog is in the state and names operations, but a tip's
  conditions are validators over the repository, not over command history.
- **"More than N commits".** `commit_count` is exact, so a tip can catch a specific wrong count
  (three commits where two are wanted) but not a range.

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
- **Then explain the wrong route.** An objective that refuses to pass says _something_ is wrong;
  a [mistake tip](#mistake-tips) says what, in terms of the state the learner can see.
