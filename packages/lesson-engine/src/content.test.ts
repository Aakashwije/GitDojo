import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadAllLessons, loadLesson } from "./loader";
import { createDirectoryLessonSource } from "./node";

const LESSONS_DIR = fileURLToPath(new URL("../../../content/lessons", import.meta.url));
const source = createDirectoryLessonSource(LESSONS_DIR);

// Guards every lesson in content/: a malformed lesson fails CI, not a learner's session.
describe("lesson content", () => {
  it("contains only valid lessons", async () => {
    const lessons = await loadAllLessons(source);
    expect(lessons.length).toBeGreaterThan(0);
    const ids = lessons.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the first-commit lesson", async () => {
    const lesson = await loadLesson("first-commit", source);
    expect(lesson.objectives.map((objective) => objective.validator.type)).toEqual([
      "repository_initialized",
      "file_staged",
      "commit_exists",
    ]);
    expect(lesson.setup.files?.["README.md"]).toContain("Welcome to your first repository.");
  });

  it("refuses slugs that could escape the content directory", async () => {
    expect(await source.read("../package")).toBeNull();
  });
});
