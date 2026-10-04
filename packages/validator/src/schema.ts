import { type ValidatorDefinition } from "@gitdojo/shared-types";
import { z } from "zod";

const filePath = z.string().trim().min(1, "file path must not be empty");
const branchName = z.string().trim().min(1, "branch name must not be empty");
const commitMessage = z.string().trim().min(1);

/** Runtime schema for validator definitions in lesson content. Kept in sync with the type below. */
export const validatorDefinitionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("repository_initialized") }),
  z.strictObject({ type: z.literal("file_exists"), file: filePath }),
  z.strictObject({ type: z.literal("file_staged"), file: filePath }),
  z.strictObject({ type: z.literal("file_committed"), file: filePath }),
  z.strictObject({ type: z.literal("file_not_tracked"), file: filePath }),
  z.strictObject({
    type: z.literal("file_status"),
    file: filePath,
    status: z.enum(["untracked", "modified", "staged", "committed", "deleted", "conflicted"]),
  }),
  z.strictObject({ type: z.literal("commit_exists"), message: commitMessage.optional() }),
  z.strictObject({ type: z.literal("commit_count"), count: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("clean_worktree") }),
  z.strictObject({ type: z.literal("branch_exists"), branch: branchName }),
  z.strictObject({ type: z.literal("branch_not_exists"), branch: branchName }),
  z.strictObject({ type: z.literal("current_branch"), branch: branchName }),
  z
    .strictObject({
      type: z.literal("branch_points_to_commit"),
      branch: branchName,
      message: commitMessage.optional(),
      sameAs: branchName.optional(),
    })
    .refine(
      (definition) => (definition.message === undefined) !== (definition.sameAs === undefined),
      {
        message: "branch_points_to_commit needs exactly one of `message` or `sameAs`",
      },
    ),
  z.strictObject({
    type: z.literal("branches_merged"),
    branch: branchName,
    into: branchName.optional(),
  }),
  z.strictObject({
    type: z.literal("merge_commit_exists"),
    branch: branchName.optional(),
    message: commitMessage.optional(),
  }),
  z.strictObject({
    type: z.literal("branch_contains_commit"),
    branch: branchName,
    message: commitMessage,
  }),
  z.strictObject({
    type: z.literal("commit_not_on_branch"),
    branch: branchName,
    message: commitMessage,
  }),
  z.strictObject({
    type: z.literal("commit_reverted"),
    message: commitMessage,
    branch: branchName.optional(),
  }),
  z.strictObject({ type: z.literal("branch_rebased"), branch: branchName, onto: branchName }),
  z.strictObject({ type: z.literal("head_detached") }),
  z.strictObject({ type: z.literal("stash_count"), count: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("conflict_exists"), file: filePath.optional() }),
  z.strictObject({ type: z.literal("conflict_resolved"), file: filePath }),
  z.strictObject({ type: z.literal("all_conflicts_resolved") }),
  z.strictObject({ type: z.literal("merge_completed"), branch: branchName.optional() }),
  z.strictObject({
    type: z.literal("commit_on_branch"),
    branch: branchName,
    message: commitMessage.optional(),
    notOn: branchName.optional(),
  }),
]) satisfies z.ZodType<ValidatorDefinition>;
