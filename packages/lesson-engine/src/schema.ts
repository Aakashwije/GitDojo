import { isGitInternalPath, isValidBranchName, normalizeWorkspacePath } from "@gitdojo/git-engine";
import { type LessonDefinition } from "@gitdojo/shared-types";
import { validatorDefinitionSchema } from "@gitdojo/validator";
import { z } from "zod";
import { lessonContentBlockSchema } from "./content-schema";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const identifier = z
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

const fileMap = z.record(z.string(), z.string());

const branchName = z
  .string()
  .refine(isValidBranchName, { message: "must be a valid Git branch name" });

const setupSchema = z.strictObject({
  // Keys are checked below: Zod reports record-key failures only as "Invalid key in record".
  files: fileMap.optional(),
  directories: z.array(workspacePath).optional(),
  initializeGit: z.boolean().optional(),
  commits: z
    .array(
      z.strictObject({
        message: z.string().trim().min(1),
        files: fileMap.refine((files) => Object.keys(files).length > 0, {
          message: "a setup commit needs at least one file",
        }),
        branch: branchName.optional(),
      }),
    )
    .optional(),
  branches: z.array(branchName).optional(),
  currentBranch: branchName.optional(),
});

type Setup = z.infer<typeof setupSchema>;

function checkSetup(setup: Setup, ctx: z.RefinementCtx): void {
  const checkPaths = (files: Record<string, string>, path: (string | number)[]) => {
    for (const file of Object.keys(files)) {
      const reason = unsafePathReason(file);
      if (reason !== null) ctx.addIssue({ code: "custom", path: [...path, file], message: reason });
    }
  };
  checkPaths(setup.files ?? {}, ["setup", "files"]);

  const commits = setup.commits ?? [];
  if (commits.length > 0 && setup.initializeGit !== true) {
    ctx.addIssue({
      code: "custom",
      path: ["setup", "commits"],
      message: "setup commits require `initializeGit: true`",
    });
  }
  // Track committed content per branch so a commit that changes nothing (which Git refuses)
  // fails here. A new branch starts from main's content at that point.
  const trees = new Map<string, Map<string, string>>([["main", new Map()]]);
  for (const [index, commit] of commits.entries()) {
    checkPaths(commit.files, ["setup", "commits", index, "files"]);
    const branch = commit.branch ?? "main";
    if (index === 0 && branch !== "main") {
      ctx.addIssue({
        code: "custom",
        path: ["setup", "commits", 0, "branch"],
        message: "the first setup commit must be on main",
      });
    }
    let committed = trees.get(branch);
    if (!committed) {
      committed = new Map(trees.get("main"));
      trees.set(branch, committed);
    }
    const changes = Object.entries(commit.files).filter(
      ([path, content]) => committed.get(normalizeSafely(path)) !== content,
    );
    if (changes.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["setup", "commits", index, "files"],
        message: "this commit does not change any file",
      });
    }
    for (const [path, content] of changes) committed.set(normalizeSafely(path), content);
  }

  const branches = setup.branches ?? [];
  if (branches.length > 0 && commits.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["setup", "branches"],
      message: "setup branches need at least one setup commit to point at",
    });
  }
  const seen = new Set(trees.keys());
  for (const [index, branch] of branches.entries()) {
    if (seen.has(branch)) {
      ctx.addIssue({
        code: "custom",
        path: ["setup", "branches", index],
        message: `branch "${branch}" already exists`,
      });
    }
    seen.add(branch);
  }
  if (setup.currentBranch !== undefined && !seen.has(setup.currentBranch)) {
    ctx.addIssue({
      code: "custom",
      path: ["setup", "currentBranch"],
      message: `"${setup.currentBranch}" is not created by this setup`,
    });
  }
}

function normalizeSafely(path: string): string {
  try {
    return normalizeWorkspacePath(path);
  } catch {
    return path;
  }
}

// Strict objects everywhere: a typo such as `objective:` should fail loudly, not be ignored.
export const lessonDefinitionSchema = z
  .strictObject({
    id: identifier,
    slug: identifier,
    title: z.string().trim().min(1),
    type: z.enum(["concept", "interactive", "challenge"]).optional(),
    description: z.string().trim().min(1).optional(),
    goal: z.string().trim().min(1).optional(),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    concepts: z.array(z.string().trim().min(1)),
    commands: z.array(z.string().trim().min(1)).optional(),
    content: z.array(lessonContentBlockSchema).optional(),
    setup: setupSchema.default({}),
    objectives: z.array(objectiveSchema).default([]),
    hints: z.record(z.string(), z.array(z.string().trim().min(1)).min(1)).optional(),
    completion: z.strictObject({ xp: z.number().int().nonnegative().optional() }).optional(),
  })
  .superRefine((lesson, ctx) => {
    checkSetup(lesson.setup, ctx);

    if (lesson.type === "concept") {
      if (lesson.objectives.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["objectives"],
          message: "concept lessons have no objectives; use `type: interactive` instead",
        });
      }
      if ((lesson.content ?? []).length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["content"],
          message: "a concept lesson needs at least one content block",
        });
      }
    } else if (lesson.objectives.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["objectives"],
        message: "a lesson needs at least one objective",
      });
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
