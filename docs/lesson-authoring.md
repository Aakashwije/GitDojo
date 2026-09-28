# Lesson authoring

Lessons are YAML files. Lessons that belong to a course live in `content/lessons/<course>/` and
are listed, in order, by `content/courses/<course>.yaml`; standalone lessons such as the demo live
directly in `content/lessons/`. No TypeScript is needed. Every lesson is validated
against a strict Zod schema in CI and during `next build`, so a malformed lesson can never reach a
learner.

## Create a lesson in five steps

1. **Create the YAML file.** `content/lessons/<course>/<slug>.yaml`, where `<slug>` matches the
   `slug` field (lowercase letters, digits and dashes), and add the slug to the course's `lessons`
   list. Lesson ids must be unique across all courses.
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

   `src/content.test.ts` loads every course and lesson and fails with a precise message (for
   example `objectives.1.validator: Invalid input`) if anything is wrong. It also plays a reference
   solution for every hands-on lesson through the real parser, Git engine and validators: add one to
   `SOLUTIONS` for each new interactive lesson or challenge.

## Lesson types

| `type`                  | Layout                                    | Objectives                                                                       |
| ----------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| `concept`               | Reading page with `content`, no terminal  | None; learner marks done                                                         |
| `interactive` (default) | Workspace: lesson, terminal, graph, files | At least one; hints end with the exact command                                   |
| `challenge`             | Workspace, with a "Challenge" header      | At least one; describe the end state and never prescribe commands, even in hints |

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

### Setup with history

Lessons about history or branches can start from an existing repository:

```yaml
setup:
  initializeGit: true # required for commits
  commits: # created on main, oldest first, a minute apart
    - message: Initial commit
      files:
        README.md: "# Weather App\n"
    - message: Add homepage
      files:
        index.html: "<h1>Weather App</h1>\n"
  branches: # created at the last setup commit; the learner stays on main
    - feature/login
  files: # written last, so these are uncommitted changes
    login.js: "export {};\n"
```

### Content blocks

`content` holds explanations, diagrams, examples and demos. Concept lessons need at least one
block; interactive lessons may add some, shown under "Reference" in the lesson panel. Text fields
support paragraphs, `- ` bullet lists, `code` and **bold**.

```yaml
content:
  - type: text
    title: A branch is a label # optional on every block
    body: A **branch** is a name that points at one commit.

  - type: diagram # exactly one of ascii, graph or areas
    graph:
      commits: # oldest first; parents must come before children
        - { id: A, message: Initial commit }
        - { id: B, parent: A, message: Add homepage }
      branches: { main: B, feature/login: B }
      head: main # a branch name, or a commit id for a detached HEAD
    caption: Both branches point at the same commit.

  - type: example
    command: git status
    output: | # optional
      On branch main
    explanation: What the output means. # optional

  - type: comparison
    columns:
      - { title: Git, items: [Runs locally] }
      - { title: GitHub, items: [Hosts repositories] }

  - type: callout
    tone: tip # tip | note | warning
    body: Run `git status` often.

  - type: demo # the learner steps through at least two steps
    title: A file's journey
    steps:
      - caption: A new file is untracked.
        areas: # or graph: { ... }
          workingTree: [{ path: login.js, status: untracked }]
          staging: []
          repository: [README.md] # plain names show no status badge
      - caption: Stage it.
        command: git add login.js # optional, shown as typed
        areas:
          workingTree: []
          staging: [{ path: login.js, status: staged }]
          repository: [README.md]
```

## Courses

```yaml
# content/courses/git-basics.yaml
id: git-basics
slug: git-basics # must match the file name
title: Git Basics
description: Learn how Git repositories, staging, commits, and history work.
difficulty: beginner
order: 1 # optional; position on /learn
lessons: # slugs of files in content/lessons/git-basics/, in learning order
  - what-is-git
  - git-init
```

Every lesson file in a course directory must be listed by the course, and every listed lesson must
exist.

### Rules the schema enforces

- Concept lessons have no objectives and at least one content block; other lessons need at least
  one objective.
- Setup commits need `initializeGit: true`, and each must change at least one file. Setup branches
  need a setup commit and a valid, unused branch name.
- Diagram graphs may only reference commits and branches they define.
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
- **Objectives complete in order.** An objective only completes after the ones before it, so
  "switch back to `main`" works even though it is true at the start. In challenges, list the end
  state in an order that rejects wrong routes (see `first-repository-challenge.yaml`).
- **Never let a lesson start completed.** The content test fails if any objective passes before the
  learner has typed a command.
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
