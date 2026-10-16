import { emptyProgress, applyProgressAction } from "@gitdojo/progress";
import { type LessonValidationResult, type PracticeTaskSummary } from "@gitdojo/shared-types";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetProgressStoreForTests, useProgressStore } from "@/features/progress";
import { PracticeBrowser } from "./components/PracticeBrowser";
import { PracticePanel } from "./components/PracticePanel";
import { matchesFilter, practiceSkills, skillLabel } from "./services/practice-navigation";

const router = { push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const task = (
  id: string,
  skill: string,
  difficulty: PracticeTaskSummary["difficulty"],
  missingCommands: string[] = [],
): PracticeTaskSummary => ({
  id,
  title: `Task ${id}`,
  skill,
  difficulty,
  mission: `Do ${id}.`,
  missingCommands,
});

const TASKS = [
  task("a", "branches", "beginner"),
  task("b", "tags", "beginner"),
  task("c", "remotes", "advanced"),
  task("locked", "remotes", "advanced", ["teleport"]),
];

function solve(...ids: string[]) {
  let progress = emptyProgress(0);
  for (const [index, id] of ids.entries()) {
    progress = applyProgressAction(
      progress,
      { type: "complete", content: { kind: "practice", id } },
      index + 1,
    );
  }
  useProgressStore.setState({ progress, status: "ready" });
}

beforeEach(() => {
  resetProgressStoreForTests();
  router.push.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("practice navigation", () => {
  it("labels skills from the taxonomy and filters by topic and difficulty", () => {
    expect(skillLabel("branches")).toBe("Branches");
    expect(skillLabel("unknown-skill")).toBe("unknown-skill");
    // Taxonomy order, not alphabetical.
    expect(practiceSkills(TASKS).map((skill) => skill.id)).toEqual(["branches", "tags", "remotes"]);
    const first = TASKS[0];
    if (!first) throw new Error("no task");
    expect(matchesFilter(first, { skill: "branches", difficulty: "all" })).toBe(true);
    expect(matchesFilter(first, { skill: "all", difficulty: "advanced" })).toBe(false);
  });
});

describe("PracticeBrowser", () => {
  it("lists tasks with solved and locked states, and counts playable ones", () => {
    solve("b");
    render(<PracticeBrowser tasks={TASKS} />);
    const cards = screen.getAllByTestId("practice-card");
    expect(cards.map((card) => card.dataset.state)).toEqual(["open", "solved", "open", "locked"]);
    expect(screen.getByTestId("practice-solved")).toHaveTextContent("1 / 3 solved");
    expect(within(cards[1] as HTMLElement).getByRole("link")).toHaveAccessibleName(
      "Practice again: Task b",
    );
    expect(within(cards[3] as HTMLElement).queryByRole("link")).toBeNull();
  });

  it("filters by topic and difficulty", async () => {
    solve();
    const user = userEvent.setup();
    render(<PracticeBrowser tasks={TASKS} />);
    await user.selectOptions(screen.getByLabelText("Topic"), "remotes");
    expect(screen.getAllByTestId("practice-card").map((card) => card.dataset.task)).toEqual([
      "c",
      "locked",
    ]);
    await user.click(screen.getByRole("button", { name: "Beginner" }));
    expect(screen.queryAllByTestId("practice-card")).toEqual([]);
    expect(screen.getByText("No practice tasks match these filters yet.")).toBeInTheDocument();
  });

  it("surprises with an unsolved task, a different one on each press, and never a locked one", async () => {
    solve("a");
    const user = userEvent.setup();
    render(<PracticeBrowser tasks={TASKS} />);
    await user.click(screen.getByTestId("surprise-me"));
    await user.click(screen.getByTestId("surprise-me"));
    const hrefs = router.push.mock.calls.map(([href]) => href as string);
    expect(hrefs).toHaveLength(2);
    expect(new Set(hrefs)).toEqual(new Set(["/practice/b", "/practice/c"]));
    expect(screen.getByRole("status")).toHaveTextContent(/^Opening Task [bc]…$/);
  });

  it("says so when nothing playable matches", async () => {
    solve();
    const user = userEvent.setup();
    render(<PracticeBrowser tasks={[task("locked", "remotes", "advanced", ["teleport"])]} />);
    await user.click(screen.getByTestId("surprise-me"));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("No playable task matches");
  });
});

describe("PracticePanel", () => {
  const validation = (passed: boolean[]): LessonValidationResult => ({
    lessonId: "a",
    objectives: passed.map((ok, index) => ({
      objectiveId: `check-${String(index + 1)}`,
      passed: ok,
      ...(ok ? {} : { reason: `Reason ${String(index + 1)}.` }),
    })),
    passedCount: passed.filter(Boolean).length,
    totalCount: passed.length,
    completed: passed.every(Boolean),
  });
  const props = {
    task: task("a", "branches", "beginner"),
    scenario: "Something happened.",
    related: { href: "/learn/branching/commit-on-branch", title: "Commit on a Feature Branch" },
    another: { href: "/practice/b", title: "Task b" },
    onRetry: vi.fn(),
  };

  it("shows the scenario and mission, and no objectives or hints", () => {
    render(<PracticePanel {...props} validation={validation([false, true])} solved={false} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Task a");
    expect(screen.getByText("Something happened.")).toBeInTheDocument();
    expect(screen.getByText("Do a.")).toBeInTheDocument();
    expect(screen.queryByText(/Check 1/)).toBeNull();
    expect(screen.queryByRole("button", { name: /hint/i })).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByTestId("practice-status")).toHaveTextContent("Not solved yet.");
  });

  it("checks on request and names one thing that is not there yet", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <PracticePanel {...props} validation={validation([true, false])} solved={false} />,
    );
    await user.click(screen.getByTestId("practice-check"));
    expect(screen.getByTestId("practice-feedback")).toHaveTextContent("Not yet. Reason 2.");
    // A new step means a new state: the old feedback goes away.
    rerender(<PracticePanel {...props} validation={validation([false, false])} solved={false} />);
    expect(screen.queryByTestId("practice-feedback")).toBeNull();
  });

  it("celebrates a solve and offers a retry, another task and the related lesson", async () => {
    const user = userEvent.setup();
    render(<PracticePanel {...props} validation={validation([true, true])} solved />);
    expect(screen.getByTestId("practice-status")).toHaveTextContent("Solved");
    expect(screen.queryByTestId("practice-check")).toBeNull();
    expect(screen.getByTestId("practice-another")).toHaveAttribute("href", "/practice/b");
    expect(screen.getByRole("link", { name: "Commit on a Feature Branch" })).toHaveAttribute(
      "href",
      "/learn/branching/commit-on-branch",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it("waits while the workspace loads", () => {
    render(<PracticePanel {...props} validation={null} solved={false} />);
    expect(screen.getByTestId("practice-status")).toHaveTextContent("Setting up the repository…");
    expect(screen.getByTestId("practice-check")).toBeDisabled();
  });
});
