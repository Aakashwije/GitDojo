import { type ValidatorDefinition } from "@gitdojo/shared-types";
import { z } from "zod";

const filePath = z.string().trim().min(1, "file path must not be empty");

/** Runtime schema for validator definitions in lesson content. Kept in sync with the type below. */
export const validatorDefinitionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("repository_initialized") }),
  z.strictObject({ type: z.literal("file_exists"), file: filePath }),
  z.strictObject({ type: z.literal("file_staged"), file: filePath }),
  z.strictObject({
    type: z.literal("commit_exists"),
    message: z.string().trim().min(1).optional(),
  }),
  z.strictObject({ type: z.literal("commit_count"), count: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("clean_worktree") }),
]) satisfies z.ZodType<ValidatorDefinition>;
