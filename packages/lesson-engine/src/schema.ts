import { normalizeWorkspacePath, isGitInternalPath } from "@gitdojo/git-engine";
import { type LessonDefinition } from "@gitdojo/shared-types";
import { validatorDefinitionSchema } from "@gitdojo/validator";
import { z } from "zod";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const identifier = z
  .string()
  .regex(SLUG_PATTERN, "must be lowercase letters, digits and single dashes");

/** Setup paths are written into the learner's workspace, so they must stay inside it. */
function unsafePathReason(path: string): string | null {
  try {
    const normalized = normalizeWorkspacePath(path);
    if (normalized === "") return "path must not be empty";
    if (isGitInternalPath(normalized)) return `"${path}" must not point inside .git`;
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : `"${path}" is not a safe path`;
  }
}

const workspacePath = z.string().superRefine((path, ctx) => {
  const reason = unsafePathReason(path);
  if (reason !== null) ctx.addIssue({ code: "custom", message: reason });
});

const objectiveSchema = z.strictObject({
  id: identifier,
  description: z.string().trim().min(1),
  validator: validatorDefinitionSchema,
});

// Strict objects everywhere: a typo such as `objective:` should fail loudly, not be ignored.
export const lessonDefinitionSchema = z
  .strictObject({
    id: identifier,
    slug: identifier,
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    goal: z.string().trim().min(1).optional(),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    concepts: z.array(z.string().trim().min(1)),
    commands: z.array(z.string().trim().min(1)).optional(),
    setup: z.strictObject({
      // Keys are checked below: Zod reports record-key failures only as "Invalid key in record".
      files: z.record(z.string(), z.string()).optional(),
      directories: z.array(workspacePath).optional(),
      initializeGit: z.boolean().optional(),
    }),
    objectives: z.array(objectiveSchema).min(1, "a lesson needs at least one objective"),
    hints: z.record(z.string(), z.array(z.string().trim().min(1)).min(1)).optional(),
    completion: z.strictObject({ xp: z.number().int().nonnegative().optional() }).optional(),
  })
  .superRefine((lesson, ctx) => {
    for (const path of Object.keys(lesson.setup.files ?? {})) {
      const reason = unsafePathReason(path);
      if (reason !== null) {
        ctx.addIssue({ code: "custom", path: ["setup", "files", path], message: reason });
      }
    }

    const seen = new Set<string>();
    for (const [index, objective] of lesson.objectives.entries()) {
      if (seen.has(objective.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["objectives", index, "id"],
          message: `duplicate objective id "${objective.id}"`,
        });
      }
      seen.add(objective.id);
    }
    for (const hintKey of Object.keys(lesson.hints ?? {})) {
      if (!seen.has(hintKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["hints", hintKey],
          message: `hints refer to unknown objective "${hintKey}"`,
        });
      }
    }
  }) satisfies z.ZodType<LessonDefinition>;
