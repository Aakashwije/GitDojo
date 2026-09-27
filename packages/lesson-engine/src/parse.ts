import { type LessonDefinition } from "@gitdojo/shared-types";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { type z } from "zod";
import { InvalidLessonError } from "./errors";
import { lessonDefinitionSchema } from "./schema";

function formatIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.map(String).join(".");
  return path === "" ? issue.message : `${path}: ${issue.message}`;
}

/** Validates an already-parsed lesson object. Throws {@link InvalidLessonError} with every issue. */
export function validateLessonDefinition(data: unknown, origin: string): LessonDefinition {
  const result = lessonDefinitionSchema.safeParse(data);
  if (!result.success) throw new InvalidLessonError(origin, result.error.issues.map(formatIssue));
  return result.data;
}

/** Parses and validates lesson YAML. */
export function parseLesson(yamlSource: string, origin = "lesson"): LessonDefinition {
  let data: unknown;
  try {
    data = parseYaml(yamlSource);
  } catch (error) {
    if (error instanceof YAMLParseError) throw new InvalidLessonError(origin, [error.message]);
    throw error;
  }
  return validateLessonDefinition(data, origin);
}
