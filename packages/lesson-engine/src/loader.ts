import { type LessonDefinition } from "@gitdojo/shared-types";
import { InvalidLessonError, LessonNotFoundError } from "./errors";
import { parseLesson } from "./parse";

/** Where lesson YAML comes from: the content directory at build time, memory in tests, ... */
export interface LessonSource {
  /** Returns the raw YAML for a slug, or `null` when no such lesson exists. */
  read(slug: string): Promise<string | null>;
  list(): Promise<string[]>;
}

export async function loadLesson(slug: string, source: LessonSource): Promise<LessonDefinition> {
  const yamlSource = await source.read(slug);
  if (yamlSource === null) throw new LessonNotFoundError(slug);
  const lesson = parseLesson(yamlSource, `${slug}.yaml`);
  if (lesson.slug !== slug) {
    throw new InvalidLessonError(`${slug}.yaml`, [
      `slug "${lesson.slug}" does not match the file name "${slug}"`,
    ]);
  }
  return lesson;
}

export async function loadAllLessons(source: LessonSource): Promise<LessonDefinition[]> {
  const slugs = await source.list();
  return Promise.all(slugs.map((slug) => loadLesson(slug, source)));
}

export function createInMemoryLessonSource(lessons: Record<string, string>): LessonSource {
  return {
    read: (slug) => Promise.resolve(Object.hasOwn(lessons, slug) ? (lessons[slug] ?? null) : null),
    list: () => Promise.resolve(Object.keys(lessons).sort()),
  };
}
