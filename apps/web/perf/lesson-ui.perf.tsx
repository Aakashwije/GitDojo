// @vitest-environment jsdom
/**
 * Stress scenarios for the lesson UI, run with `pnpm perf`. Lesson content is authored and
 * validated in CI, so it never grows the way a learner's repository does; these guard the parts
 * whose cost is proportional to content or to how often a lesson re-renders:
 *
 * - example output renders one element per line, so diff lines can be coloured
 * - a concept lesson derives its "In this lesson" outline from every block title
 * - the objective list re-renders after every command, and announces completions from an effect
 * - a demo re-renders its whole visual on each step
 *
 * They are the rendering counterpart to "parse + validate lesson YAML" in scenarios.perf.ts, at
 * the same 400-block size.
 */
import { type LessonContentBlock, type LessonObjective } from "@gitdojo/shared-types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { contentSections, LessonContent } from "@/features/lesson/components/content/LessonContent";
import { DemoPlayer } from "@/features/lesson/components/content/DemoPlayer";
import { ObjectiveList } from "@/features/lesson/components/ObjectiveList";
import { measure } from "./harness";

/** A twenty-line diff, the longest kind of output a lesson realistically shows. */
function diff(index: number): string {
  const body = Array.from({ length: 16 }, (_, line) =>
    line % 4 === 0
      ? `-  const total = ${String(line)};`
      : line % 4 === 1
        ? `+  const total = ${String(line + index)};`
        : `   untouched line ${String(line)}`,
  );
  return [
    `diff --git a/src/file-${String(index)}.ts b/src/file-${String(index)}.ts`,
    "index 3b18e51..8f1c2a0 100644",
    `--- a/src/file-${String(index)}.ts`,
    `+++ b/src/file-${String(index)}.ts`,
    "@@ -1,16 +1,16 @@",
    ...body,
  ].join("\n");
}

/** 400 blocks of every type, the size the YAML parsing scenario uses. */
function blocks(count: number): LessonContentBlock[] {
  return Array.from({ length: count }, (_, i) => {
    switch (i % 5) {
      case 0:
        return {
          type: "text",
          title: `Section ${String(i)}`,
          body: `Paragraph with **bold**, \`code\` and a list.\n\n- one \`git add\`\n- two`,
        };
      case 1:
        return {
          type: "example",
          title: `Example ${String(i)}`,
          command: "git diff",
          output: diff(i),
        };
      case 2:
        return {
          type: "comparison",
          title: `Comparison ${String(i)}`,
          columns: [
            { title: `Left ${String(i)}`, items: ["First item", "Second item"] },
            { title: `Right ${String(i)}`, items: ["Third item", "Fourth item"] },
          ],
        };
      case 3:
        return { type: "callout", tone: "tip", body: `Remember \`git status\` (${String(i)}).` };
      default:
        return {
          type: "diagram",
          title: `Diagram ${String(i)}`,
          caption: `Caption ${String(i)}.`,
          graph: {
            commits: [
              { id: "A", message: "Initial commit" },
              { id: "B", parent: "A", message: "Add homepage" },
              { id: "C", parent: "B", message: "Add login form" },
            ],
            branches: { main: "B", "feature/login": "C" },
            head: "feature/login",
          },
        };
    }
  });
}

describe("lesson content rendering", () => {
  it("renders a very large lesson and derives its outline", async () => {
    const BLOCKS = 400;
    const content = blocks(BLOCKS);

    const sections = await measure(
      "lesson outline from content blocks",
      `${String(BLOCKS)} blocks`,
      () => contentSections(content),
    );
    // Callouts are asides, so four blocks in five become linkable sections, each with its own id.
    expect(sections).toHaveLength(BLOCKS - BLOCKS / 5);
    expect(new Set(sections.map((section) => section.id)).size).toBe(sections.length);

    const { container } = await measure(
      "render lesson content",
      `${String(BLOCKS)} blocks, 80 diffs of 21 lines`,
      () => render(<LessonContent blocks={content} />),
    );
    // Every diff line is its own element, so colouring is per line.
    expect(container.querySelectorAll("pre > span").length).toBe((BLOCKS / 5) * 21);
    cleanup();
  }, 300_000);
});

describe("objective list re-renders", () => {
  it("advances through a long lesson one objective at a time", async () => {
    const OBJECTIVES = 60;
    const objectives: LessonObjective[] = Array.from({ length: OBJECTIVES }, (_, i) => ({
      id: `o${String(i)}`,
      description: `Objective ${String(i)} with \`code\` in it.`,
      validator: { type: "file_exists", file: `f${String(i)}.txt` },
    }));

    const { rerender } = await measure(
      "render objectives",
      `${String(OBJECTIVES)} objectives`,
      () => render(<ObjectiveList objectives={objectives} completedIds={[]} currentId="o0" />),
    );

    // One re-render per command, as the workspace does. A render loop or an O(n^2) announcement
    // would blow the budget rather than fail silently.
    await measure("advance every objective in turn", `${String(OBJECTIVES)} completions`, () => {
      for (let i = 0; i < OBJECTIVES; i += 1) {
        rerender(
          <ObjectiveList
            objectives={objectives}
            completedIds={objectives.slice(0, i + 1).map((objective) => objective.id)}
            currentId={objectives[i + 1]?.id ?? null}
          />,
        );
      }
    });
    expect(screen.getByRole("status").textContent).toBe(
      `Objective complete: ${objectives[OBJECTIVES - 1]?.description ?? ""} ${String(OBJECTIVES)} of ${String(OBJECTIVES)} done.`,
    );
    expect(screen.getByText(`${String(OBJECTIVES)}/${String(OBJECTIVES)}`)).toBeDefined();
    cleanup();
  }, 300_000);
});

describe("demo stepping", () => {
  it("steps through a long demo without the cost growing", async () => {
    const STEPS = 50;
    const steps = Array.from({ length: STEPS }, (_, i) => ({
      caption: `Step ${String(i)}: the file moves on.`,
      command: `git add file-${String(i)}.js`,
      areas: {
        workingTree: Array.from({ length: 10 }, (_, f) => ({
          path: `file-${String(f)}.js`,
          status: "modified" as const,
        })),
        staging: [{ path: `file-${String(i)}.js`, status: "staged" as const }],
        repository: ["README.md"],
      },
    }));

    render(<DemoPlayer title="Long demo" steps={steps} />);
    await measure("step through a demo", `${String(STEPS)} steps, 11 files each`, () => {
      for (let i = 1; i < STEPS; i += 1) {
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
      }
    });
    expect(screen.getByTestId("demo-step").textContent).toContain(
      `Step ${String(STEPS)} of ${String(STEPS)}`,
    );
    cleanup();
  }, 300_000);
});
