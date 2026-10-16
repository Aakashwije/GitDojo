import { type ValidatorDefinition } from "@gitdojo/shared-types";
import { z } from "zod";

const filePath = z.string().trim().min(1, "file path must not be empty");
const branchName = z.string().trim().min(1, "branch name must not be empty");
const commitMessage = z.string().trim().min(1);
const tagName = z.string().trim().min(1, "tag name must not be empty");
const remoteName = z.string().trim().min(1, "remote name must not be empty");

/** Runtime schema for validator definitions in lesson content. Kept in sync with the type below. */
export const validatorDefinitionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("repository_initialized") }),
  z.strictObject({ type: z.literal("file_exists"), file: filePath }),
  z.strictObject({ type: z.literal("file_staged"), file: filePath }),
  z.strictObject({ type: z.literal("file_committed"), file: filePath }),
  z.strictObject({ type: z.literal("file_not_tracked"), file: filePath }),
  z.strictObject({ type: z.literal("file_content"), file: filePath, content: z.string() }),
  z.strictObject({
    type: z.literal("file_status"),
    file: filePath,
    status: z.enum(["untracked", "modified", "staged", "committed", "deleted", "conflicted"]),
  }),
  z.strictObject({ type: z.literal("commit_exists"), message: commitMessage.optional() }),
  z.strictObject({ type: z.literal("commit_count"), count: z.number().int().nonnegative() }),
  z.strictObject({
    type: z.literal("commit_changes"),
    branch: branchName,
    message: commitMessage,
    files: z
      .array(filePath)
      .min(1)
      .refine((files) => new Set(files).size === files.length, {
        message: "commit_changes files must be unique",
      }),
  }),
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
  z.strictObject({ type: z.literal("conflict_ready_to_stage"), file: filePath }),
  z.strictObject({ type: z.literal("all_conflicts_resolved") }),
  z.strictObject({ type: z.literal("merge_completed"), branch: branchName.optional() }),
  z.strictObject({
    type: z.literal("branch_history"),
    branch: branchName,
    messages: z.array(commitMessage).min(1, "branch_history needs at least one message"),
    complete: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal("tag_exists"),
    tag: tagName,
    message: commitMessage.optional(),
    annotated: z.boolean().optional(),
  }),
  z.strictObject({ type: z.literal("tag_not_exists"), tag: tagName }),
  z
    .strictObject({
      type: z.literal("remote_branch_points_to_commit"),
      branch: branchName,
      remote: remoteName.optional(),
      message: commitMessage.optional(),
      sameAs: branchName.optional(),
    })
    .refine(
      (definition) => (definition.message === undefined) !== (definition.sameAs === undefined),
      { message: "remote_branch_points_to_commit needs exactly one of `message` or `sameAs`" },
    ),
  z
    .strictObject({
      type: z.literal("remote_tracking_branch_points_to_commit"),
      ref: z
        .string()
        .trim()
        .regex(/^[^/\s]+\/\S+$/, "must look like origin/main"),
      message: commitMessage.optional(),
      matchesRemote: z.boolean().optional(),
    })
    .refine((definition) => definition.message !== undefined || definition.matchesRemote === true, {
      message: "remote_tracking_branch_points_to_commit needs `message` or `matchesRemote: true`",
    }),
  z.strictObject({
    type: z.literal("branch_upstream"),
    branch: branchName,
    upstream: z
      .string()
      .trim()
      .regex(/^[^/\s]+\/\S+$/, "must look like origin/main"),
  }),
  z.strictObject({
    type: z.literal("commit_on_branch"),
    branch: branchName,
    message: commitMessage.optional(),
    notOn: branchName.optional(),
  }),
]) satisfies z.ZodType<ValidatorDefinition>;
