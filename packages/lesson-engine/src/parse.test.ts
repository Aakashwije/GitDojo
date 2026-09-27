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
        expect.stringContaining("objectives"),
      ]),
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
