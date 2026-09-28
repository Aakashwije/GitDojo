import { type DemoGraph, type LessonContentBlock, type LessonVisual } from "@gitdojo/shared-types";
import { z } from "zod";

const text = z.string().trim().min(1);

const demoFile = z.union([
  text,
  z.strictObject({
    path: text,
    status: z.enum(["untracked", "modified", "staged", "committed", "deleted"]),
  }),
]);

const demoAreas = z.strictObject({
  workingTree: z.array(demoFile),
  staging: z.array(demoFile),
  repository: z.array(demoFile),
});

const demoGraph = z
  .strictObject({
    commits: z
      .array(
        z.strictObject({
          id: text,
          message: text.optional(),
          parent: text.optional(),
        }),
      )
      .min(1, "a graph needs at least one commit"),
    branches: z.record(text, text).optional(),
    head: text.optional(),
  })
  .superRefine((graph: DemoGraph, ctx) => {
    const seen = new Set<string>();
    for (const [index, commit] of graph.commits.entries()) {
      if (seen.has(commit.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["commits", index, "id"],
          message: `duplicate commit id "${commit.id}"`,
        });
      }
      if (commit.parent !== undefined && !seen.has(commit.parent)) {
        ctx.addIssue({
          code: "custom",
          path: ["commits", index, "parent"],
          message: `parent "${commit.parent}" must be listed before "${commit.id}"`,
        });
      }
      seen.add(commit.id);
    }
    for (const [branch, target] of Object.entries(graph.branches ?? {})) {
      if (!seen.has(target)) {
        ctx.addIssue({
          code: "custom",
          path: ["branches", branch],
          message: `branch "${branch}" points to unknown commit "${target}"`,
        });
      }
    }
    if (
      graph.head !== undefined &&
      !seen.has(graph.head) &&
      !Object.hasOwn(graph.branches ?? {}, graph.head)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["head"],
        message: `head "${graph.head}" is neither a branch nor a commit`,
      });
    }
  });

function exactlyOneVisual(keys: readonly (keyof LessonVisual)[]) {
  return (visual: LessonVisual, ctx: z.RefinementCtx) => {
    const present = keys.filter((key) => visual[key] !== undefined);
    if (present.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: `set exactly one of ${keys.map((key) => `\`${key}\``).join(", ")}`,
      });
    }
  };
}

const demoStep = z
  .strictObject({
    caption: text,
    command: text.optional(),
    graph: demoGraph.optional(),
    areas: demoAreas.optional(),
  })
  .superRefine(exactlyOneVisual(["graph", "areas"]));

/** Blocks of explanatory content. Kept in sync with `LessonContentBlock`. */
export const lessonContentBlockSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), title: text.optional(), body: text }),
  z
    .strictObject({
      type: z.literal("diagram"),
      title: text.optional(),
      caption: text.optional(),
      // Not trimmed: leading spaces are part of the drawing.
      ascii: z.string().min(1).optional(),
      graph: demoGraph.optional(),
      areas: demoAreas.optional(),
    })
    .superRefine(exactlyOneVisual(["ascii", "graph", "areas"])),
  z.strictObject({
    type: z.literal("example"),
    title: text.optional(),
    command: text,
    output: z.string().min(1).optional(),
    explanation: text.optional(),
  }),
  z.strictObject({
    type: z.literal("comparison"),
    title: text.optional(),
    columns: z
      .array(z.strictObject({ title: text, items: z.array(text).min(1) }))
      .min(2, "a comparison needs at least two columns"),
  }),
  z.strictObject({
    type: z.literal("callout"),
    tone: z.enum(["tip", "note", "warning"]),
    title: text.optional(),
    body: text,
  }),
  z.strictObject({
    type: z.literal("demo"),
    title: text.optional(),
    steps: z.array(demoStep).min(2, "a demo needs at least two steps"),
  }),
]) satisfies z.ZodType<LessonContentBlock>;
