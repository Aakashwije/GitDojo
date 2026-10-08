import { type DemoGraph, type DemoStep } from "@gitdojo/shared-types";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DemoGraphView, describeGraph } from "./DemoGraphView";
import { DemoPlayer } from "./DemoPlayer";
import { contentSections, LessonContent } from "./LessonContent";

const diverged: DemoGraph = {
  commits: [
    { id: "A", message: "Initial commit" },
    { id: "B", parent: "A", message: "Add homepage" },
    { id: "C", parent: "B", message: "Add login form" },
  ],
  branches: { main: "B", "feature/login": "C" },
  head: "feature/login",
};

describe("DemoGraphView", () => {
  it("lists commits newest first with branch labels and HEAD on its branch", () => {
    render(<DemoGraphView graph={diverged} />);
    const graph = screen.getByTestId("demo-graph");
    expect(graph).toHaveAttribute("aria-label", describeGraph(diverged));
    expect(describeGraph(diverged)).toBe(
      'Commit graph with 3 commits. main points to "Add homepage". feature/login points to "Add login form". HEAD points to feature/login',
    );
    const rows = within(graph).getAllByRole("listitem", { hidden: true });
    expect(rows.map((row) => row.textContent)).toEqual([
      "Add login formHEADfeature/login",
      "Add homepagemain",
      "Initial commit",
    ]);
    const current = within(graph).getAllByTestId("branch-label");
    expect(current.find((label) => label.dataset.current)?.dataset.branch).toBe("feature/login");
  });

  it("shows a detached HEAD on its own", () => {
    render(<DemoGraphView graph={{ ...diverged, head: "A" }} />);
    expect(screen.getByTestId("demo-graph").getAttribute("aria-label")).toContain(
      'HEAD points directly to "Initial commit"',
    );
    const rows = screen.getAllByRole("listitem", { hidden: true });
    expect(rows.at(-1)?.textContent).toBe("Initial commitHEAD");
  });
});

describe("DemoPlayer", () => {
  const steps: DemoStep[] = [
    {
      caption: "Two modified files.",
      areas: { workingTree: [{ path: "a.js", status: "modified" }], staging: [], repository: [] },
    },
    {
      caption: "Stage one.",
      command: "git add a.js",
      areas: { workingTree: [], staging: [{ path: "a.js", status: "staged" }], repository: [] },
    },
  ];

  it("steps forward and back, then offers a replay", async () => {
    render(<DemoPlayer title="Staging" steps={steps} />);
    expect(screen.getByTestId("demo-step")).toHaveTextContent("Step 1 of 2");
    expect(screen.getByRole("button", { name: /back/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByTestId("demo-step")).toHaveTextContent("Step 2 of 2");
    expect(screen.getByText("git add a.js")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Staging Area" })).getByText("a.js"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /replay/i }));
    expect(screen.getByTestId("demo-step")).toHaveTextContent("Step 1 of 2");
    await userEvent.click(screen.getByRole("button", { name: "Go to step 2" }));
    expect(screen.getByText("Stage one.")).toBeInTheDocument();
  });

  it("shows progress and announces the step it is on", () => {
    render(<DemoPlayer title="Staging" steps={steps} />);
    const progress = screen.getByRole("progressbar", { name: "Demonstration progress" });
    expect(progress).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("status")).toHaveTextContent("Step 1 of 2. Two modified files.");
  });

  it("walks the steps with the arrow keys from the step dots", async () => {
    render(<DemoPlayer title="Staging" steps={steps} />);
    const first = screen.getByRole("button", { name: "Go to step 1" });
    // Roving tabindex: only the current dot is a tab stop.
    expect(first).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: "Go to step 2" })).toHaveAttribute("tabindex", "-1");

    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByTestId("demo-step")).toHaveTextContent("Step 2 of 2");
    expect(screen.getByRole("button", { name: "Go to step 2" })).toHaveFocus();

    await userEvent.keyboard("{Home}");
    expect(screen.getByTestId("demo-step")).toHaveTextContent("Step 1 of 2");
    expect(screen.getByRole("button", { name: "Go to step 1" })).toHaveFocus();
  });
});

describe("LessonContent", () => {
  it("renders every block type", () => {
    render(
      <LessonContent
        blocks={[
          { type: "text", title: "Snapshots", body: "Git records **snapshots**." },
          { type: "diagram", ascii: "A -> B\n", caption: "A `diagram`." },
          { type: "example", command: "git status", output: "On branch main\n" },
          {
            type: "comparison",
            columns: [
              { title: "Git", items: ["Local"] },
              { title: "GitHub", items: ["Hosted"] },
            ],
          },
          { type: "callout", tone: "tip", body: "Commit often." },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Snapshots", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("snapshots").tagName).toBe("STRONG");
    expect(screen.getByText("A -> B")).toBeInTheDocument();
    expect(screen.getByText("git status")).toBeInTheDocument();
    expect(screen.getByText("On branch main")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "GitHub" })).toHaveTextContent("Hosted");
    // The tone is spelled out, so it never depends on colour alone.
    expect(screen.getByRole("complementary", { name: "Tip" })).toHaveTextContent("Tip");
  });

  it("colours added and removed lines of example output", () => {
    render(
      <LessonContent
        blocks={[
          {
            type: "example",
            command: "git diff",
            output: "--- a/price.js\n+++ b/price.js\n@@ -1 +1 @@\n-old line\n+new line\n",
          },
        ]}
      />,
    );
    expect(screen.getByText("+new line")).toHaveClass("text-success");
    expect(screen.getByText("-old line")).toHaveClass("text-danger");
    expect(screen.getByText("@@ -1 +1 @@")).toHaveClass("text-info");
    // The file headers are noise, not changes.
    expect(screen.getByText("+++ b/price.js")).toHaveClass("text-fg-muted");
  });

  it("anchors titled sections so a lesson can link to its own headings", () => {
    const blocks = [
      { type: "text", title: "A branch is a label", body: "Text." },
      { type: "callout", tone: "tip", title: "Handy", body: "Tip." },
      { type: "text", title: "A branch is a label", body: "More." },
    ] as const;
    expect(contentSections(blocks)).toEqual([
      { id: "a-branch-is-a-label", title: "A branch is a label" },
      { id: "a-branch-is-a-label-2", title: "A branch is a label" },
    ]);

    const { container } = render(<LessonContent blocks={blocks} />);
    expect(container.querySelector("#a-branch-is-a-label")).toBeInTheDocument();
    expect(container.querySelector("#a-branch-is-a-label-2")).toBeInTheDocument();
  });
});
