import {
  type LessonDefinition,
  type LessonObjective,
  type LessonTip,
  type LessonValidationResult,
  type ValidatorDefinition,
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

/** Evaluates one condition against the current repository state. Never rejects. */
async function checkCondition(
  validator: ValidatorDefinition,
  context: ValidatorContext,
  registry: ValidatorRegistry,
  failureReason: string,
): Promise<ValidatorResult> {
  if (!Object.hasOwn(registry, validator.type)) {
    return { passed: false, reason: `Unknown validator type "${validator.type}".` };
  }
  try {
    return await runValidator(registry, validator.type, validator, context);
  } catch (error) {
    console.error(`[gitdojo] validator "${validator.type}" failed`, error);
    return { passed: false, reason: failureReason };
  }
}

/** Evaluates one objective against the current repository state. Never rejects. */
export function validateObjective(
  objective: LessonObjective,
  context: ValidatorContext,
  registry: ValidatorRegistry = validatorRegistry,
): Promise<ValidatorResult> {
  return checkCondition(
    objective.validator,
    context,
    registry,
    "This objective could not be checked.",
  );
}

/**
 * Ids of the tips whose every condition holds right now, in the order they were authored. The UI
 * shows the first one, so authors put the most specific tip first.
 *
 * This reports the *current* state only: unlike objective progress, a tip is never sticky, so it
 * disappears as soon as the learner resolves what it describes. A tip whose condition cannot be
 * checked simply does not match.
 */
export async function evaluateTips(
  tips: readonly LessonTip[],
  context: ValidatorContext,
  registry: ValidatorRegistry = validatorRegistry,
): Promise<string[]> {
  const matches = await Promise.all(
    tips.map(async (tip) => {
      const results = await Promise.all(
        tip.when.map((condition) =>
          checkCondition(condition, context, registry, "This tip could not be checked."),
        ),
      );
      return results.length > 0 && results.every((result) => result.passed) ? tip.id : null;
    }),
  );
  return matches.filter((id) => id !== null);
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
