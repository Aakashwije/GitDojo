import {
  type LessonDefinition,
  type LessonObjective,
  type LessonValidationResult,
  type ValidatorResult,
  type ValidatorType,
} from "@gitdojo/shared-types";
import { validatorRegistry } from "./registry";
import { type ValidatorContext, type ValidatorOfType, type ValidatorRegistry } from "./types";

// Indexing the registry with the same generic key as the definition lets TypeScript correlate
// handler and definition without a cast.
function runValidator<K extends ValidatorType>(
  registry: ValidatorRegistry,
  type: K,
  definition: ValidatorOfType<K>,
  context: ValidatorContext,
): Promise<ValidatorResult> {
  return registry[type](definition, context);
}

/** Evaluates one objective against the current repository state. Never rejects. */
export async function validateObjective(
  objective: LessonObjective,
  context: ValidatorContext,
  registry: ValidatorRegistry = validatorRegistry,
): Promise<ValidatorResult> {
  const { validator } = objective;
  if (!Object.hasOwn(registry, validator.type)) {
    return { passed: false, reason: `Unknown validator type "${validator.type}".` };
  }
  try {
    return await runValidator(registry, validator.type, validator, context);
  } catch (error) {
    console.error(`[gitdojo] validator "${validator.type}" failed`, error);
    return { passed: false, reason: "This objective could not be checked." };
  }
}

/**
 * Evaluates every objective against the *current* state. Objectives are independent: this
 * reports what is true right now, not what the learner has achieved over time.
 */
export async function validateLesson(
  lesson: Pick<LessonDefinition, "id" | "objectives">,
  context: ValidatorContext,
  registry: ValidatorRegistry = validatorRegistry,
): Promise<LessonValidationResult> {
  const objectives = await Promise.all(
    lesson.objectives.map(async (objective) => ({
      objectiveId: objective.id,
      ...(await validateObjective(objective, context, registry)),
    })),
  );
  const passedCount = objectives.filter((objective) => objective.passed).length;
  return {
    lessonId: lesson.id,
    objectives,
    passedCount,
    totalCount: objectives.length,
    completed: passedCount === objectives.length,
  };
}
