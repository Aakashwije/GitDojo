import {
  checkObjectives,
  checkSetup,
  hintsSchema,
  identifier,
  objectiveSchema,
  setupSchema,
} from "@gitdojo/lesson-engine";
import { type ChallengeDefinition } from "@gitdojo/shared-types";
import { z } from "zod";
import { CHALLENGE_CATEGORIES } from "./categories";

const text = z.string().trim().min(1);
const categoryIds = CHALLENGE_CATEGORIES.map((category) => category.id) as [
  ChallengeDefinition["category"],
  ...ChallengeDefinition["category"][],
];

/** Strict, like lessons: a typo such as `objective:` fails loudly. */
export const challengeDefinitionSchema = z
  .strictObject({
    id: identifier,
    title: text,
    category: z.enum(categoryIds),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    order: z.number().int().optional(),
    scenario: text,
    mission: text,
    concepts: z.array(text).min(1, "a challenge needs at least one concept"),
    // Git subcommand names as typed after `git`, e.g. `reset` or `cherry-pick`.
    requires: z.array(z.string().regex(/^[a-z][a-z-]*$/, "must be a Git command name")).optional(),
    setup: setupSchema.default({}),
    objectives: z.array(objectiveSchema).min(1, "a challenge needs at least one success condition"),
    hints: hintsSchema.optional(),
  })
  .superRefine((challenge, ctx) => {
    checkSetup(challenge.setup, ctx);
    checkObjectives(challenge, ctx, { challenge: true });
  }) satisfies z.ZodType<ChallengeDefinition>;
