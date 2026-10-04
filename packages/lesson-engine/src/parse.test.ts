import { describe, expect, it } from "vitest";
import { InvalidLessonError, LessonNotFoundError } from "./errors";
import { createInMemoryLessonSource, loadLesson } from "./loader";
import { parseLesson } from "./parse";

const VALID = `
id: sample
slug: sample
title: Sample lesson
difficulty: beginner
concepts: [staging]
setup:
  files:
    README.md: "# Hi\\n"
objectives:
  - id: init
    description: Initialize.
    validator:
      type: repository_initialized
  - id: stage
    description: Stage README.
    validator:
      type: file_staged
      file: README.md
hints:
  init:
    - Try git init.
completion:
  xp: 50
`;

function issuesFor(source: string): string[] {
  try {
    parseLesson(source, "test.yaml");
  } catch (error) {
    if (error instanceof InvalidLessonError) return error.issues;
    throw error;
  }
  throw new Error("expected the lesson to be rejected");
}

describe("parseLesson", () => {
  it("parses a valid lesson", () => {
    const lesson = parseLesson(VALID);
    expect(lesson).toMatchObject({
      id: "sample",
      title: "Sample lesson",
      difficulty: "beginner",
      setup: { files: { "README.md": "# Hi\n" } },
      completion: { xp: 50 },
    });
    expect(lesson.objectives[1]?.validator).toEqual({ type: "file_staged", file: "README.md" });
  });

  it("rejects malformed YAML", () => {
    expect(issuesFor("id: [unclosed")).toHaveLength(1);
  });

  it("rejects missing required fields", () => {
    const issues = issuesFor("id: x\nslug: x\n");
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("title"),
        expect.stringContaining("difficulty"),
        expect.stringContaining("concepts"),
      ]),
    );
  });

  it("requires objectives unless the lesson is a concept lesson", () => {
    const withoutObjectives = VALID.slice(0, VALID.indexOf("objectives:"));
    expect(issuesFor(withoutObjectives).join("\n")).toContain(
      "objectives: a lesson needs at least one objective",
    );
  });

  it("rejects unknown validator types", () => {
    const issues = issuesFor(VALID.replace("type: repository_initialized", "type: magic"));
    expect(issues.join("\n")).toContain("objectives.0.validator");
  });

  it("rejects validator definitions missing fields", () => {
    expect(issuesFor(VALID.replace("      file: README.md\n", "")).join("\n")).toContain(
      "objectives.1.validator",
    );
  });

  it("rejects unknown keys to catch typos", () => {
    expect(issuesFor(`${VALID}\nobjective: oops\n`).join("\n")).toMatch(/objective/);
  });

  it("rejects duplicate objective ids and hints for unknown objectives", () => {
    const duplicated = VALID.replace("id: stage", "id: init");
    expect(issuesFor(duplicated).join("\n")).toContain('duplicate objective id "init"');
    const orphanHint = VALID.replace("hints:\n  init:", "hints:\n  nope:");
    expect(issuesFor(orphanHint).join("\n")).toContain('unknown objective "nope"');
  });

  it("rejects setup files that escape the workspace or touch .git", () => {
    expect(issuesFor(VALID.replace("README.md: ", "../evil.sh: ")).join("\n")).toMatch(/traversal/);
    expect(issuesFor(VALID.replace("README.md: ", ".git/config: ")).join("\n")).toMatch(/\.git/);
  });

  it("rejects an invalid difficulty", () => {
    expect(issuesFor(VALID.replace("beginner", "expert")).join("\n")).toContain("difficulty");
  });
});

const CONCEPT = `
id: concept
slug: concept
title: What is a branch?
type: concept
difficulty: beginner
concepts: [branches]
content:
  - type: text
    title: Pointers
    body: A branch is a movable pointer to a commit.
  - type: diagram
    graph:
      commits:
        - id: A
        - id: B
          parent: A
      branches:
        main: B
      head: main
  - type: demo
    steps:
      - caption: Start
        areas: { workingTree: [README.md], staging: [], repository: [] }
      - caption: Stage it
        command: git add README.md
        areas:
          workingTree: []
          staging: [{ path: README.md, status: staged }]
          repository: []
`;

describe("concept lessons", () => {
  it("parse without setup or objectives", () => {
    const lesson = parseLesson(CONCEPT);
    expect(lesson.type).toBe("concept");
    expect(lesson.objectives).toEqual([]);
    expect(lesson.setup).toEqual({});
    expect(lesson.content?.map((block) => block.type)).toEqual(["text", "diagram", "demo"]);
  });

  it("need content and must not have objectives", () => {
    const noContent = CONCEPT.slice(0, CONCEPT.indexOf("content:"));
    expect(issuesFor(noContent).join("\n")).toContain("at least one content block");
    const withObjectives = `${CONCEPT}objectives:
  - id: a
    description: A.
    validator: { type: repository_initialized }
`;
    expect(issuesFor(withObjectives).join("\n")).toContain("concept lessons have no objectives");
  });

  it("reject diagrams with zero or several visuals", () => {
    const none = CONCEPT.replace(
      / {2}- type: diagram\n {4}graph:[\s\S]*?head: main\n/,
      "  - type: diagram\n    title: Empty\n",
    );
    expect(issuesFor(none).join("\n")).toContain("set exactly one of `ascii`, `graph`, `areas`");
    const both = CONCEPT.replace("  - type: diagram\n", "  - type: diagram\n    ascii: x\n");
    expect(issuesFor(both).join("\n")).toContain("set exactly one of");
  });

  it("reject graphs that reference unknown commits", () => {
    expect(issuesFor(CONCEPT.replace("main: B", "main: Z")).join("\n")).toContain(
      'branch "main" points to unknown commit "Z"',
    );
    expect(issuesFor(CONCEPT.replace("parent: A", "parent: B")).join("\n")).toContain(
      'parent "B" must be listed before "B"',
    );
    expect(issuesFor(CONCEPT.replace("head: main", "head: nope")).join("\n")).toContain(
      "neither a branch nor a commit",
    );
  });
});

const WITH_HISTORY = `
id: history
slug: history
title: History
difficulty: beginner
concepts: []
setup:
  initializeGit: true
  commits:
    - message: Initial commit
      files:
        README.md: "# Hi\\n"
    - message: Add homepage
      files:
        index.html: "<h1>Hi</h1>\\n"
  branches: [feature/login]
objectives:
  - id: switch
    description: Switch.
    validator: { type: current_branch, branch: feature/login }
`;

describe("setup history", () => {
  it("parses setup commits and branches", () => {
    const lesson = parseLesson(WITH_HISTORY);
    expect(lesson.setup.commits?.map((commit) => commit.message)).toEqual([
      "Initial commit",
      "Add homepage",
    ]);
    expect(lesson.setup.branches).toEqual(["feature/login"]);
  });

  it("requires initializeGit for setup commits", () => {
    expect(
      issuesFor(WITH_HISTORY.replace("initializeGit: true", "initializeGit: false")).join("\n"),
    ).toContain("setup commits require `initializeGit: true`");
  });

  it("accepts commits on other branches and a starting branch", () => {
    const branched = WITH_HISTORY.replace(
      "    - message: Add homepage\n",
      "    - message: Add homepage\n      branch: feature/home\n",
    ).replace(
      "  branches: [feature/login]\n",
      "  branches: [feature/login]\n  currentBranch: feature/home\n",
    );
    const lesson = parseLesson(branched);
    expect(lesson.setup.commits?.[1]?.branch).toBe("feature/home");
    expect(lesson.setup.currentBranch).toBe("feature/home");
    expect(
      issuesFor(branched.replace("currentBranch: feature/home", "currentBranch: nope")).join("\n"),
    ).toContain('"nope" is not created by this setup');
  });

  it("accepts deletions of files the branch has, and only those", () => {
    const deletion = WITH_HISTORY.replace(
      '        index.html: "<h1>Hi</h1>\\n"\n',
      '        index.html: "<h1>Hi</h1>\\n"\n        README.md: null\n',
    );
    expect(parseLesson(deletion).setup.commits?.[1]?.files).toMatchObject({ "README.md": null });
    expect(issuesFor(deletion.replace("README.md: null", "nope.md: null")).join("\n")).toContain(
      'cannot delete "nope.md": main does not have it at this point',
    );
  });

  it("rejects commits that change nothing and invalid or duplicate branches", () => {
    const noop = WITH_HISTORY.replace('index.html: "<h1>Hi</h1>\\n"', 'README.md: "# Hi\\n"');
    expect(issuesFor(noop).join("\n")).toContain("this commit does not change any file");
    expect(issuesFor(WITH_HISTORY.replace("[feature/login]", "[bad..name]")).join("\n")).toContain(
      "valid Git branch name",
    );
    expect(issuesFor(WITH_HISTORY.replace("[feature/login]", "[main]")).join("\n")).toContain(
      'branch "main" already exists',
    );
  });
});

describe("setup commands", () => {
  const withCommands = (commands: string) =>
    WITH_HISTORY.replace(
      "  branches: [feature/login]\n",
      `  branches: [feature/login]\n  commands: ${commands}\n`,
    );

  it("accepts Git commands", () => {
    expect(parseLesson(withCommands('["git switch --detach HEAD~1"]')).setup.commands).toEqual([
      "git switch --detach HEAD~1",
    ]);
  });

  it("rejects commands that are not Git or do not parse", () => {
    expect(issuesFor(withCommands('["help"]')).join("\n")).toContain(
      "setup commands must be Git commands",
    );
    expect(issuesFor(withCommands('["rm -rf ."]')).join("\n")).toContain("rm: command not found");
    expect(issuesFor(withCommands('["git commit --amend"]')).join("\n")).toContain(
      "unknown option '--amend'",
    );
  });

  it("require initializeGit", () => {
    expect(
      issuesFor(
        withCommands('["git branch x"]').replace("initializeGit: true", "initializeGit: false"),
      ).join("\n"),
    ).toContain("setup commands require `initializeGit: true`");
  });
});

describe("loadLesson", () => {
  it("loads a lesson by slug", async () => {
    const source = createInMemoryLessonSource({ sample: VALID });
    expect((await loadLesson("sample", source)).id).toBe("sample");
  });

  it("fails for unknown slugs", async () => {
    await expect(loadLesson("missing", createInMemoryLessonSource({}))).rejects.toBeInstanceOf(
      LessonNotFoundError,
    );
  });

  it("fails when the slug does not match the file", async () => {
    const source = createInMemoryLessonSource({ other: VALID });
    await expect(loadLesson("other", source)).rejects.toBeInstanceOf(InvalidLessonError);
  });
});
