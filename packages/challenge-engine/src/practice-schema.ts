import { GIT_COMMAND_SPECS, PLANNED_GIT_COMMANDS } from "@gitdojo/command-parser";
import { checkSetup, identifier, setupSchema } from "@gitdojo/lesson-engine";
import { namesCommand } from "@gitdojo/hints";
import { type PracticeTaskDefinition } from "@gitdojo/shared-types";
import { validatorDefinitionSchema } from "@gitdojo/validator";
import { z } from "zod";

const text = z.string().trim().min(1);

const SUBCOMMANDS = new Set([...Object.keys(GIT_COMMAND_SPECS), ...PLANNED_GIT_COMMANDS]);

/** "git rebase", with or without backticks: practice text never names the tool to reach for. */
export function mentionsGitCommand(value: string): boolean {
  if (namesCommand(value)) return true;
  for (const match of value.matchAll(/\bgit\s+([a-z][a-z-]*)/gi)) {
    if (SUBCOMMANDS.has((match[1] ?? "").toLowerCase())) return true;
  }
  return false;
}

/**
 * Strict, like lessons and challenges. Practice reuses the challenge safety rules, more strictly:
 * there are no hints at all, the checks are never shown, and neither the scenario nor the
 * mission may name a command.
 */
export const practiceTaskSchema = z
  .strictObject({
    id: identifier,
    title: text,
    skill: identifier,
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    order: z.number().int().optional(),
    scenario: text,
    mission: text,
    concepts: z.array(text).min(1, "a practice task needs at least one concept"),
    requires: z.array(z.string().regex(/^[a-z][a-z-]*$/, "must be a Git command name")).optional(),
    related: z.strictObject({ course: identifier, lesson: identifier }).optional(),
    setup: setupSchema.default({}),
    checks: z.array(validatorDefinitionSchema).min(1, "a practice task needs at least one check"),
  })
  .superRefine((task, ctx) => {
    checkSetup(task.setup, ctx);
    for (const field of ["scenario", "mission"] as const) {
      if (mentionsGitCommand(task[field])) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "practice tasks must not name the command to use",
        });
      }
    }
  }) satisfies z.ZodType<PracticeTaskDefinition>;
