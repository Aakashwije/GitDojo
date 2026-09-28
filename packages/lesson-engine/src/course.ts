import {
  lessonTypeOf,
  type CourseDefinition,
  type CourseOutline,
  type LessonDefinition,
} from "@gitdojo/shared-types";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { z } from "zod";
import { CourseNotFoundError, InvalidCourseError } from "./errors";
import { loadLesson, type LessonSource } from "./loader";
import { formatIssue } from "./parse";
import { identifier } from "./schema";

/** Courses come from the same kind of YAML source as lessons: `content/courses/<slug>.yaml`. */
export type CourseSource = LessonSource;

export const courseDefinitionSchema = z
  .strictObject({
    id: identifier,
    slug: identifier,
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    order: z.number().int().optional(),
    lessons: z.array(identifier).min(1, "a course needs at least one lesson"),
  })
  .superRefine((course, ctx) => {
    const seen = new Set<string>();
    for (const [index, lesson] of course.lessons.entries()) {
      if (seen.has(lesson)) {
        ctx.addIssue({
          code: "custom",
          path: ["lessons", index],
          message: `lesson "${lesson}" is listed twice`,
        });
      }
      seen.add(lesson);
    }
  }) satisfies z.ZodType<CourseDefinition>;

export function parseCourse(yamlSource: string, origin = "course"): CourseDefinition {
  let data: unknown;
  try {
    data = parseYaml(yamlSource);
  } catch (error) {
    if (error instanceof YAMLParseError) throw new InvalidCourseError(origin, [error.message]);
    throw error;
  }
  const result = courseDefinitionSchema.safeParse(data);
  if (!result.success) throw new InvalidCourseError(origin, result.error.issues.map(formatIssue));
  return result.data;
}

export interface LoadedCourse {
  course: CourseDefinition;
  /** In course order. */
  lessons: LessonDefinition[];
}

/**
 * Loads a course and every lesson it lists. `lessonsFor` returns the source for a course's
 * lesson directory (`content/lessons/<course slug>/`).
 */
export async function loadCourse(
  slug: string,
  courses: CourseSource,
  lessonsFor: (courseSlug: string) => LessonSource,
): Promise<LoadedCourse> {
  const yamlSource = await courses.read(slug);
  if (yamlSource === null) throw new CourseNotFoundError(slug);
  const course = parseCourse(yamlSource, `${slug}.yaml`);
  if (course.slug !== slug) {
    throw new InvalidCourseError(`${slug}.yaml`, [
      `slug "${course.slug}" does not match the file name "${slug}"`,
    ]);
  }
  const source = lessonsFor(course.slug);
  const lessons = await Promise.all(course.lessons.map((lesson) => loadLesson(lesson, source)));
  return { course, lessons };
}

/** Every course, ordered by `order` and then title. */
export async function loadAllCourses(
  courses: CourseSource,
  lessonsFor: (courseSlug: string) => LessonSource,
): Promise<LoadedCourse[]> {
  const slugs = await courses.list();
  const loaded = await Promise.all(slugs.map((slug) => loadCourse(slug, courses, lessonsFor)));
  return loaded.sort(
    (a, b) =>
      (a.course.order ?? 0) - (b.course.order ?? 0) || a.course.title.localeCompare(b.course.title),
  );
}

/** The lightweight view of a course that navigation needs; safe to send to the client. */
export function toCourseOutline({ course, lessons }: LoadedCourse): CourseOutline {
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    difficulty: course.difficulty,
    lessons: lessons.map((lesson, index) => ({
      id: lesson.id,
      slug: lesson.slug,
      title: lesson.title,
      type: lessonTypeOf(lesson),
      number: index + 1,
    })),
  };
}
