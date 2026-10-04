import { type PlaygroundScenario } from "@gitdojo/shared-types";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { z } from "zod";
import { InvalidLessonError, LessonNotFoundError } from "./errors";
import { type LessonSource } from "./loader";
import { formatIssue } from "./parse";
import { checkSetup, identifier, setupSchema } from "./schema";

export const playgroundScenarioSchema = z
  .strictObject({
    id: identifier,
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    order: z.number().int().optional(),
    setup: setupSchema.default({}),
  })
  .superRefine((scenario, ctx) => {
    checkSetup(scenario.setup, ctx);
  }) satisfies z.ZodType<PlaygroundScenario>;

export function parseScenario(yamlSource: string, origin = "scenario"): PlaygroundScenario {
  let data: unknown;
  try {
    data = parseYaml(yamlSource);
  } catch (error) {
    if (error instanceof YAMLParseError) throw new InvalidLessonError(origin, [error.message]);
    throw error;
  }
  const result = playgroundScenarioSchema.safeParse(data);
  if (!result.success) throw new InvalidLessonError(origin, result.error.issues.map(formatIssue));
  return result.data;
}

/** Every scenario in `content/playground/`, by `order` then title. Ids must match file names. */
export async function loadAllScenarios(source: LessonSource): Promise<PlaygroundScenario[]> {
  const scenarios = await Promise.all(
    (await source.list()).map(async (id) => {
      const yamlSource = await source.read(id);
      if (yamlSource === null) throw new LessonNotFoundError(id);
      const scenario = parseScenario(yamlSource, `${id}.yaml`);
      if (scenario.id !== id) {
        throw new InvalidLessonError(`${id}.yaml`, [
          `id "${scenario.id}" does not match the file name "${id}"`,
        ]);
      }
      return scenario;
    }),
  );
  return scenarios.sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title),
  );
}
