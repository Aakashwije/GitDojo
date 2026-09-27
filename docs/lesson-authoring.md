# Lesson authoring

Lessons are YAML files in `content/lessons/`. No TypeScript is needed. Every lesson is validated
against a strict Zod schema in CI and during `next build`, so a malformed lesson can never reach a
learner.

## Create a lesson in five steps

1. **Create the YAML file.** `content/lessons/<slug>.yaml`, where `<slug>` matches the `slug` field
   (lowercase letters, digits and dashes).
2. **Describe the starting state** in `setup`: which files exist and whether Git is already
   initialized.
3. **Write objectives.** Each one is a short sentence for the learner and a validator that checks
   the repository.
4. **Use supported validators** only (see [validators.md](./validators.md)). Check state, not
   commands: "README.md is staged", not "the learner typed `git add README.md`".
5. **Run the validation tests:**

   ```bash
   pnpm --filter @gitdojo/lesson-engine test
   ```

   `src/content.test.ts` loads every file in `content/lessons` and fails with a precise message
   (for example `objectives.1.validator: Invalid input`) if anything is wrong.

## Reference

```yaml
id: first-commit # unique id
slug: first-commit # must match the file name
title: Your First Commit

goal: Turn a plain folder into a Git repository and record its first snapshot. # optional
description: | # optional; supports paragraphs, `code` and **bold**
  Git only tracks a folder once you tell it to.

difficulty: beginner # beginner | intermediate | advanced

concepts: # tags, used for search and future learning paths
  - git-init
  - staging

commands: # optional; listed on the completion card
  - git init
  - git add

setup:
  initializeGit: false # optional, default false
  directories: # optional; empty directories to create
    - docs
  files: # workspace-relative path → content
    README.md: |
      # GitDojo

objectives: # evaluated independently, shown in order
  - id: initialize
    description: Initialize the repository.
    validator:
      type: repository_initialized

hints: # optional; objective id → hints, vague first, explicit last
  initialize:
    - Git does not know this folder is a repository yet.
    - Try `git init`.

completion:
  xp: 100 # optional
```

### Rules the schema enforces

- Unknown keys are rejected, which catches typos such as `objective:`.
- Objective ids are unique, and every `hints` key must name an existing objective.
- Setup paths must stay inside the workspace (no `..`) and must not point into `.git`.
- `commit_count.count` is a non-negative integer, and file paths are non-empty.

## Writing good lessons

- **One concept per lesson.** Three to five objectives is usually right.
- **Order objectives in the order learners will meet them.** The first unmet objective is
  highlighted as "current" and its hints are shown.
- **Remember progress is sticky.** Once an objective passes it stays completed, so later steps may
  legitimately undo earlier state (committing empties the staging area).
- **Write hints as a ladder.** Start with the concept, then point at the tool, and end with the exact
  command in backticks.
- **Accept every valid solution.** Prefer validators that pass for any reasonable command sequence.

## How lessons are loaded

`loadLesson(slug, source)` from `@gitdojo/lesson-engine` reads YAML from a `LessonSource`, parses
it, and validates it. The web app uses `createDirectoryLessonSource` (from
`@gitdojo/lesson-engine/node`) on the server at build time and passes the validated lesson to the
client as plain data.

`setupLesson(lesson, workspaceId, env)` empties the workspace, creates directories and files,
optionally runs `git init`, and returns the initial `RepositoryState`. `resetLesson` does the same,
so a reset always restores the exact original state.
