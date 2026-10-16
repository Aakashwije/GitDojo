# Practice authoring

Practice mode (`/practice`) offers short Git tasks, one main skill each, with **no step-by-step
objectives and no hints at all**. A learner picks a topic or difficulty, or presses **Surprise
me**, works in the usual workspace, and the task is solved when the repository is in the end
state the mission describes. Each task is one YAML file in `content/practice/<id>.yaml`.

Practice is curated content, validated like lessons and challenges. Nothing is generated, and
everything works offline.

## How it differs

|            | Lesson                     | Challenge                                         | Practice task                            |
| ---------- | -------------------------- | ------------------------------------------------- | ---------------------------------------- |
| Guidance   | Ordered objectives, hints  | Listed success conditions, hints without commands | A mission only: no objectives, no hints  |
| Completion | Sticky, ordered objectives | Sticky, ordered objectives                        | Every check holds **at the same time**   |
| Feedback   | Hints, "Not yet: ..."      | Hints, tips                                       | "Check my work": one thing not there yet |
| Progress   | `completedLessons`, XP     | `completedChallenges`, XP                         | `completedPractice`, **no XP**           |

A task is turned into a lesson of type `challenge` (`practiceToLessonDefinition` in
`@gitdojo/challenge-engine`) so the workspace's setup and validators run it, but its checks
become objectives the learner never sees, and `PracticeSession`
(`apps/web/features/workspace/services/practice-session.ts`) evaluates them non-sticky: undoing
the end state un-solves the task. Error explanations are spoiler-free, as in challenges.

## Create a task

1. **Create `content/practice/<id>.yaml`.** The `id` matches the file name and is the URL,
   `/practice/<id>`.
2. **Pick one skill** from the taxonomy in `packages/progress/src/skills.ts` (`branches`,
   `tags`, `remotes`, `rewriting-history`...). Include concepts that map onto it, so the
   dashboard counts the task towards that skill.
3. **Write a short scenario and an end-state mission.** Neither may mention a Git subcommand,
   with or without backticks: the schema rejects `git rebase`, `` `git tag` `` and the like.
   Name branches, files, messages and tags the end state needs.
4. **Build the starting state** with `setup`, exactly as for lessons (history, branches, files,
   setup `commands`, a [simulated remote](./lesson-authoring.md#setup-with-a-simulated-remote)).
5. **Write `checks`**: validators that must all hold at once (see [validators.md](./validators.md)).
   Check the end state, never the route, and add checks that reject look-alike states (an extra
   file committed, a merge commit where history should be straight).
6. **Link a related lesson** (`related: { course, lesson }`), shown after the task.
7. **Add a reference solution** to `SOLUTIONS` in
   `packages/challenge-engine/src/practice.test.ts`, and a wrong route to "rejects end states that
   only look right" when there is an obvious one. Then run:

   ```bash
   pnpm validate:content
   pnpm --filter @gitdojo/web exec vitest run lib/skills-content.test.ts
   ```

## Reference

```yaml
id: tag-a-release # also the file name and URL
title: Tag a Release
skill: tags # one skill id from the taxonomy
difficulty: beginner # beginner | intermediate | advanced
order: 3 # optional; position within its difficulty

scenario: |
  Version 2.0 is done: it is the commit you are on. Someone already made a tag called
  `v2.0-rc` while testing.
mission: >
  Mark the current commit as release `v2.0` with an annotated tag, and make sure `v2.0-rc` no
  longer exists.

concepts: [tags, releases]
requires: [tag] # Git commands it needs; locked until GitDojo supports them all
related: { course: everyday-git, lesson: git-tag }

setup:
  initializeGit: true
  commits:
    - message: Initial commit
      files: { timer.js: "export {};\n" }
  commands:
    - git tag v2.0-rc

checks: # all at once, after every command and edit
  - type: tag_exists
    tag: v2.0
    annotated: true
  - type: tag_not_exists
    tag: v2.0-rc
```

Unknown fields (`hints`, `objectives`, `tips`) are rejected.

## Rules the tests enforce

- Every task parses, has at least one check, is playable, and is not solved at the start.
- Every task has a reference solution that solves it through the real parser and Git engine.
- There are at least three tasks of each difficulty, and no more than twenty in total: a
  manageable, high-quality set beats many shallow ones.
- Every `skill` is a taxonomy id, every task's concepts include its skill, every concept label in
  lessons, challenges and practice maps to a skill, and every `related` lesson exists
  (`apps/web/lib/skills-content.test.ts`).

## "Surprise me"

`pickSurpriseTask` (`@gitdojo/progress`) is deterministic: among the tasks matching the filters,
it prefers unsolved ones, skips the task the learner is on and the one solved most recently
whenever anything else is eligible, and picks by a seed. The browser passes a counter, so each
press moves on. Locked tasks are never picked.
