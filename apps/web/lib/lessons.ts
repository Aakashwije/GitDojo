import "server-only";

import { loadLesson as loadLessonFromSource } from "@gitdojo/lesson-engine";
import { createDirectoryLessonSource } from "@gitdojo/lesson-engine/node";
import { type LessonDefinition } from "@gitdojo/shared-types";
import path from "node:path";

// Lessons are read and validated at build time; an invalid lesson fails `next build`.
const LESSONS_DIR = path.join(process.cwd(), "..", "..", "content", "lessons");

export function loadLesson(slug: string): Promise<LessonDefinition> {
  return loadLessonFromSource(slug, createDirectoryLessonSource(LESSONS_DIR));
}
