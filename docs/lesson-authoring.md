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
   `SOLUTIONS` for each new interactive lesson or challenge. Steps are commands, or
   `{ write, content }` for a file edited in the UI (e.g. resolving a conflict).

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
  branches: # created at main's last setup commit
    - feature/login
  files: # written last, so these are uncommitted changes
    login.js: "export {};\n"
```

Commits can go on other branches, which is how merge and conflict lessons build diverged
histories. A branch that does not exist yet is created at `main`'s tip at that point in the list,
so the list reads in the order the history was made:

```yaml
setup:
  initializeGit: true
  commits:
    - message: Initial commit # the first commit is always on main
      files: { src/auth.ts: "export const timeout = 30;\n" }
    - message: Extend session timeout
      branch: feature/login # branches off main here
      files: { src/auth.ts: "export const timeout = 60;\n" }
    - message: Shorten session timeout # back on main: the branches have diverged
      files: { src/auth.ts: "export const timeout = 15;\n" }
  currentBranch: main # optional; the branch the learner starts on (default main)
```

Changing the same line on both branches gives a deterministic merge conflict. A file mapped to
`null` is deleted in that commit, which sets up modify/delete conflicts:

```yaml
- message: Drop the setup guide
  files:
    docs/setup.md: null # main deletes it while another branch edits it
```

### Setup commands

Some starting states are easiest to describe as what happened to the repository. `commands` runs
Git commands **last**, after the commits, branches and `files`, through the real parser and engine,
exactly as if typed in the terminal. So a command can stage or stash a setup file. Each must
succeed, or the lesson fails to load.

```yaml
setup:
  initializeGit: true # required for commands
  commits:
    - message: Initial commit
      files: { README.md: "# Shop\n" }
    - message: Add checkout
      files: { checkout.js: "pay();\n" }
  files:
    notes.md: "- [ ] todo\n"
  commands:
    - git add notes.md # notes.md starts staged
    - git switch --detach HEAD~1 # and the learner starts with a detached HEAD
```

Only Git commands are allowed; anything else (or a command that does not parse) is rejected by
the schema.

### Hints

Hints are a ladder per objective, from vague to explicit, and GitDojo reveals them one at a time.
Each hint has a **level**:

| Level | Label   | Gives away                      | Example                                                |
| ----- | ------- | ------------------------------- | ------------------------------------------------------ |
| 1     | Concept | The idea, not the command       | "Your changes only exist in the working tree."         |
| 2     | Command | Which command (family) does it  | "You need the command that moves a file into staging." |
| 3     | Answer  | The exact command, in backticks | "Run `git add README.md`."                             |

Plain strings get their level from their position: the first is a concept, the last is the answer
when it names a Git command in backticks, and anything between names the command. Set a level
explicitly when position would be wrong:

```yaml
hints:
  stage:
    - Your changes only exist in the working tree. # level 1
    - { level: 2, text: "`git add` moves files into the staging area." }
    - Run `git add README.md`. # level 3: last, and names a command
```

The schema rejects ladders whose levels go down, and level-3 hints that do not name a command.
In the lesson, an answer needs a second, deliberate click, and once the learner has tried a
command the panel also shows what the current objective's validator says is missing
("Not yet: README.md is not staged."). Every guided lesson must let learners reach an answer for
at least one objective (the content tests check this).

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
        # - { id: M, parent: B, merge: C } adds a merge commit (merge = second parent)
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

## Playground scenarios

The playground's ready-made repositories live in `content/playground/<id>.yaml`. A scenario is a
title, a short description and a `setup` block with exactly the same fields as a lesson's:

```yaml
id: two-branches # must match the file name
title: Two Branches
description: main and feature/search have each moved on since they split.
order: 3 # optional; position in the scenario picker
setup:
  initializeGit: true
  commits:
    - message: Initial commit
      files: { README.md: "# Bookshelf\n" }
    - message: Add search box
      branch: feature/search
      files: { src/search.js: "export {};\n" }
```

`src/content.test.ts` sets up every scenario, so a broken one fails CI.

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
  command in backticks (see [Hints](#hints)).
- **Accept every valid solution.** Prefer validators that pass for any reasonable command sequence.

## How lessons are loaded

`loadLesson(slug, source)` from `@gitdojo/lesson-engine` reads YAML from a `LessonSource`, parses
it, and validates it. The web app uses `createDirectoryLessonSource` (from
`@gitdojo/lesson-engine/node`) on the server at build time and passes the validated lesson to the
client as plain data.

`setupLesson(lesson, workspaceId, env)` empties the workspace, creates directories and files,
optionally runs `git init`, and returns the initial `RepositoryState`. `resetLesson` does the same,
so a reset always restores the exact original state.
