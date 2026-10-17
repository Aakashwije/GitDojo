import {
  applyProgressAction,
  createMemoryStorage,
  emptyProgress,
  ProgressRepository,
  type LocalProgress,
  type ProgressAction,
  type ProgressCatalog,
} from "@gitdojo/progress";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./components/Dashboard";
import {
  initProgress,
  recordProgress,
  resetProgressStoreForTests,
  useProgressStore,
} from "@/features/progress";

const CATALOG: ProgressCatalog = {
  courses: [
    {
      id: "git-basics",
      slug: "git-basics",
      title: "Git Basics",
      description: "",
      difficulty: "beginner",
      lessons: [
        {
          id: "what-is-git",
          slug: "what-is-git",
          title: "What is Git?",
          type: "concept",
          number: 1,
        },
        { id: "git-init", slug: "git-init", title: "git init", type: "interactive", number: 2 },
      ],
    },
    {
      id: "branching",
      slug: "branching",
      title: "Branching",
      description: "",
      difficulty: "beginner",
      lessons: [
        {
          id: "git-branch",
          slug: "git-branch",
          title: "git branch",
          type: "interactive",
          number: 1,
        },
      ],
    },
  ],
  lessons: [{ id: "first-commit", title: "Your First Commit", type: "interactive" }],
  challenges: [
    { id: "lost-commit", title: "Lost Commit" },
    { id: "wrong-branch", title: "Wrong Branch" },
  ],
  practice: [],
  concepts: {},
};

function progressAfter(actions: ProgressAction[]): LocalProgress {
  return actions.reduce(
    (progress, action, index) => applyProgressAction(progress, action, Date.now() - 1000 + index),
    emptyProgress(Date.now()),
  );
}

function show(progress: LocalProgress) {
  useProgressStore.setState({ progress, status: "ready", persistence: { mode: "saved" } });
  render(<Dashboard catalog={CATALOG} />);
}

beforeEach(() => {
  resetProgressStoreForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Dashboard", () => {
  it("shows a loading state until progress has been read", () => {
    render(<Dashboard catalog={CATALOG} />);
    expect(screen.getByTestId("dashboard-loading")).toHaveAttribute("aria-busy", "true");
  });

  it("welcomes a new learner and points to the first lesson", () => {
    show(emptyProgress(Date.now()));
    expect(screen.getByTestId("dashboard-empty")).toHaveTextContent("Welcome to GitDojo");
    expect(screen.getByTestId("continue-learning")).toHaveAttribute(
      "href",
      "/learn/git-basics/what-is-git",
    );
    expect(screen.getByTestId("stat-xp")).toHaveTextContent("0");
  });

  it("adds up completed activity", () => {
    show(
      progressAfter([
        { type: "complete", content: { kind: "lesson", id: "what-is-git", type: "concept" } },
        { type: "complete", content: { kind: "lesson", id: "git-init", type: "interactive" } },
        { type: "complete", content: { kind: "challenge", id: "lost-commit" } },
        { type: "command", command: "init", ok: true },
        { type: "command", command: "commit", ok: false },
        { type: "command", command: "commit", ok: true },
        { type: "playground-session" },
        { type: "visit-lesson", courseId: "git-basics", lessonId: "git-init" },
      ]),
    );
    expect(screen.getByTestId("stat-xp")).toHaveTextContent("175");
    expect(screen.getByTestId("stat-lessons")).toHaveTextContent("2");
    expect(screen.getByText("2 of 3 course lessons")).toBeInTheDocument();
    expect(screen.getByTestId("stat-challenges")).toHaveTextContent("1");
    expect(screen.getByTestId("stat-commands")).toHaveTextContent("3");
    expect(screen.getByText("2 succeeded")).toBeInTheDocument();
    expect(screen.getByTestId("stat-playground")).toHaveTextContent("1");

    // Course progress is derived and labelled, not just a coloured bar.
    const basics = screen.getByRole("progressbar", { name: "Git Basics progress" });
    expect(basics).toHaveAttribute("aria-valuenow", "100");
    expect(basics).toHaveAttribute("aria-valuetext", "2 of 2 lessons");
    expect(screen.getByRole("progressbar", { name: "Branching progress" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );

    // git-init is done, so continue moves on to the next unfinished lesson.
    expect(screen.getByTestId("continue-learning")).toHaveAttribute(
      "href",
      "/learn/branching/git-branch",
    );

    const activity = within(screen.getByTestId("recent-activity"));
    expect(activity.getByRole("link", { name: "Lost Commit" })).toHaveAttribute(
      "href",
      "/challenges/lost-commit",
    );
    const commands = within(screen.getByTestId("command-usage"));
    expect(commands.getByRole("rowheader", { name: "git commit" })).toBeInTheDocument();
  });

  it("never links to a lesson that no longer exists", () => {
    show(
      progressAfter([
        { type: "visit-lesson", courseId: "old-course", lessonId: "removed-lesson" },
        { type: "complete", content: { kind: "lesson", id: "removed-lesson", type: "concept" } },
      ]),
    );
    expect(screen.getByTestId("continue-learning")).toHaveAttribute(
      "href",
      "/learn/git-basics/what-is-git",
    );
    const activity = within(screen.getByTestId("recent-activity"));
    expect(activity.getByText(/no longer available/)).toBeInTheDocument();
    expect(activity.queryByRole("link")).toBeNull();
  });

  it("resets learning progress only after confirmation", async () => {
    await initProgress(
      CATALOG,
      (catalog) => new ProgressRepository({ storage: createMemoryStorage(), catalog }),
    );
    await recordProgress({ type: "playground-session" });
    await recordProgress({
      type: "complete",
      content: { kind: "lesson", id: "git-init", type: "interactive" },
    });
    render(<Dashboard catalog={CATALOG} />);
    expect(screen.getByTestId("stat-xp")).toHaveTextContent("50");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("reset-progress"));
    const dialog = screen.getByRole("dialog", { name: "Reset learning progress?" });
    expect(dialog).toHaveTextContent("playground repository is not affected");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("stat-xp")).toHaveTextContent("50");

    await user.click(screen.getByTestId("reset-progress"));
    await user.click(screen.getByTestId("confirm-reset-progress"));
    await waitFor(() => {
      expect(screen.getByTestId("stat-xp")).toHaveTextContent("0");
    });
    expect(screen.getByTestId("stat-playground")).toHaveTextContent("0");
    expect(screen.getByText("Learning progress reset.")).toHaveAttribute("role", "status");
  });
});

describe("progress store", () => {
  it("applies activity recorded before progress loaded, in order", async () => {
    await recordProgress({ type: "command", command: "status", ok: true });
    await recordProgress({
      type: "complete",
      content: { kind: "lesson", id: "git-init", type: "interactive" },
    });
    expect(useProgressStore.getState().progress).toBeNull();

    await initProgress(
      CATALOG,
      (catalog) => new ProgressRepository({ storage: createMemoryStorage(), catalog }),
    );
    await waitFor(() => {
      expect(useProgressStore.getState().saving).toBe(false);
    });
    expect(useProgressStore.getState().progress).toMatchObject({
      xp: 50,
      commandStats: { status: { uses: 1 } },
    });
    expect(useProgressStore.getState().lastAward).toEqual({ key: "lesson:git-init", xp: 50 });
  });

  it("explains when progress cannot be saved in this browser", async () => {
    const failing = {
      ...createMemoryStorage(),
      kind: "indexeddb" as const,
      update: () => Promise.reject(new Error("SecurityError")),
    };
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await initProgress(CATALOG, (catalog) => new ProgressRepository({ storage: failing, catalog }));
    expect(useProgressStore.getState().persistence).toMatchObject({ mode: "memory" });
    render(<Dashboard catalog={CATALOG} />);
    expect(screen.getByText(/not letting GitDojo save it/)).toBeInTheDocument();
  });
});

describe("Dashboard skills and next steps", () => {
  const SKILLED: ProgressCatalog = {
    ...CATALOG,
    practice: [
      {
        id: "start-a-branch",
        title: "Start a Feature Branch",
        skill: "branches",
        difficulty: "beginner",
      },
    ],
    concepts: {
      "lesson:what-is-git": ["version-control"],
      "lesson:git-init": ["git-init"],
      "lesson:git-branch": ["branches"],
      "challenge:lost-commit": ["reflog"],
      "practice:start-a-branch": ["branches"],
    },
  };
  const showSkilled = (progress: LocalProgress) => {
    useProgressStore.setState({ progress, status: "ready", persistence: { mode: "saved" } });
    render(<Dashboard catalog={SKILLED} />);
  };
  const skill = (id: string) =>
    screen.getAllByTestId("skill").find((element) => element.dataset.skill === id);

  it("explains how skills are counted, and starts with none practiced", () => {
    showSkilled(emptyProgress(Date.now()));
    expect(screen.getByTestId("skills-explanation")).toHaveTextContent(
      /Practiced.*hands-on lesson, challenge or practice task.*Mastered.*3 hands-on completions, at least 1 without step-by-step help/,
    );
    expect(screen.getByTestId("skills-summary")).toHaveTextContent("0 / 16 practiced · 0 mastered");
    expect(skill("branches")).toHaveAttribute("data-status", "untouched");
    expect(skill("branches")).toHaveTextContent("Not started");
  });

  it("counts a concept lesson as read and one hands-on item as practiced, not mastered", () => {
    showSkilled(
      progressAfter([
        { type: "complete", content: { kind: "lesson", id: "what-is-git", type: "concept" } },
        { type: "complete", content: { kind: "lesson", id: "git-branch", type: "interactive" } },
      ]),
    );
    expect(skill("repositories")).toHaveAttribute("data-status", "studied");
    expect(skill("branches")).toHaveAttribute("data-status", "practiced");
    expect(skill("branches")).toHaveTextContent("1 of 2 hands-on done");
    // One completion is never mastery.
    expect(
      screen.getAllByTestId("skill").filter((element) => element.dataset.status === "mastered"),
    ).toEqual([]);
  });

  it("labels practice clearly, with no XP", () => {
    showSkilled(
      progressAfter([{ type: "complete", content: { kind: "practice", id: "start-a-branch" } }]),
    );
    expect(screen.getByTestId("stat-practice")).toHaveTextContent("1");
    expect(screen.getByText("of 1 tasks · no XP")).toBeInTheDocument();
    expect(screen.getByTestId("stat-xp")).toHaveTextContent("0");
    const activity = within(screen.getByTestId("recent-activity"));
    expect(activity.getByRole("link", { name: "Start a Feature Branch" })).toHaveAttribute(
      "href",
      "/practice/start-a-branch",
    );
    expect(activity.getByText("Practice · no XP")).toBeInTheDocument();
    expect(skill("branches")).toHaveTextContent("1 unguided");
  });

  it("recommends next steps with a reason, never completed content or the continue target", () => {
    showSkilled(
      progressAfter([
        { type: "complete", content: { kind: "lesson", id: "what-is-git", type: "concept" } },
      ]),
    );
    const continueHref = screen.getByTestId("continue-learning").getAttribute("href");
    const steps = screen.getAllByTestId("next-step");
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.length).toBeLessThanOrEqual(3);
    for (const step of steps) {
      expect(step).not.toHaveAttribute("href", continueHref ?? "");
      expect(step).not.toHaveAttribute("href", "/learn/git-basics/what-is-git");
    }
    expect(steps[0]).toHaveTextContent(/Try your first \w+ task/);
  });

  it("suggests practising again once nothing is left to recommend", () => {
    showSkilled(
      progressAfter([
        { type: "complete", content: { kind: "lesson", id: "what-is-git", type: "concept" } },
        { type: "complete", content: { kind: "lesson", id: "git-init", type: "interactive" } },
        { type: "complete", content: { kind: "lesson", id: "git-branch", type: "interactive" } },
        { type: "complete", content: { kind: "practice", id: "start-a-branch" } },
      ]),
    );
    expect(screen.getByTestId("next-steps-empty")).toHaveTextContent("Practice again");
    expect(screen.getByRole("link", { name: "Practice again" })).toHaveAttribute(
      "href",
      "/practice",
    );
  });
});

describe("Dashboard journey and visualizations", () => {
  const VISUAL: ProgressCatalog = {
    ...CATALOG,
    practice: [
      {
        id: "start-a-branch",
        title: "Start a Feature Branch",
        skill: "branches",
        difficulty: "beginner",
      },
    ],
    concepts: {
      "lesson:git-init": ["git-init"],
      "lesson:git-branch": ["branches"],
      "practice:start-a-branch": ["branches"],
    },
  };
  const showVisual = (progress: LocalProgress) => {
    useProgressStore.setState({ progress, status: "ready", persistence: { mode: "saved" } });
    return render(<Dashboard catalog={VISUAL} />);
  };
  const milestones = () =>
    screen.getAllByTestId("journey-milestone").map((item) => item.dataset.status);
  const skillCard = (id: string) =>
    screen.getAllByTestId("skill").find((element) => element.dataset.skill === id);

  it("draws the courses as a journey, in order, with the next lesson as the main action", () => {
    showVisual(
      progressAfter([
        { type: "complete", content: { kind: "lesson", id: "what-is-git", type: "concept" } },
        { type: "complete", content: { kind: "lesson", id: "git-init", type: "interactive" } },
      ]),
    );
    expect(screen.getByTestId("journey-summary")).toHaveTextContent(
      "2 of 3 course lessons completed",
    );
    expect(milestones()).toEqual(["completed", "current"]);
    const path = within(screen.getByTestId("journey-path"));
    expect(path.getAllByTestId("milestone-status").map((item) => item.textContent)).toEqual([
      "Completed",
      "Current",
    ]);
    expect(path.getByRole("link", { name: "Branching" })).toHaveAttribute("aria-current", "step");
    expect(path.getByRole("link", { name: "Git Basics" })).toHaveAttribute(
      "href",
      "/learn/git-basics",
    );
    expect(screen.getByTestId("continue-learning")).toHaveAttribute(
      "href",
      "/learn/branching/git-branch",
    );
    expect(screen.getByTestId("continue-learning")).toHaveTextContent("Next lesson");
  });

  it("celebrates a finished journey and points to challenges", () => {
    showVisual(
      progressAfter([
        { type: "complete", content: { kind: "lesson", id: "what-is-git", type: "concept" } },
        { type: "complete", content: { kind: "lesson", id: "git-init", type: "interactive" } },
        { type: "complete", content: { kind: "lesson", id: "git-branch", type: "interactive" } },
      ]),
    );
    expect(milestones()).toEqual(["completed", "completed"]);
    expect(screen.getByTestId("continue-title")).toHaveTextContent("Every course complete");
    expect(screen.getByTestId("continue-learning")).toHaveAttribute("href", "/challenges");
  });

  it("shows an empty activity calendar that points a new learner to the first lesson", () => {
    showVisual(emptyProgress(Date.now()));
    const empty = within(screen.getByTestId("activity-empty"));
    expect(empty.getByRole("link", { name: /Start with What is Git\?/ })).toHaveAttribute(
      "href",
      "/learn/git-basics/what-is-git",
    );
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("counts active days, and explains each day on keyboard focus", async () => {
    const DAY = 86_400_000;
    let progress = emptyProgress(Date.now() - 40 * DAY);
    const complete = (content: ProgressAction, at: number) => {
      progress = applyProgressAction(progress, content, at);
    };
    complete(
      { type: "complete", content: { kind: "lesson", id: "git-init", type: "interactive" } },
      Date.now(),
    );
    complete({ type: "complete", content: { kind: "challenge", id: "lost-commit" } }, Date.now());
    complete(
      { type: "complete", content: { kind: "practice", id: "start-a-branch" } },
      Date.now() - 3 * DAY,
    );
    complete(
      { type: "complete", content: { kind: "challenge", id: "wrong-branch" } },
      Date.now() - 35 * DAY,
    );
    showVisual(progress);

    expect(screen.getByTestId("activity-summary")).toHaveTextContent(
      "Active on 2 of the last 30 days · 3 completions",
    );
    const grid = screen.getByRole("grid");
    const cells = within(grid).getAllByRole("gridcell");
    expect(cells).toHaveLength(30);
    // One tab stop: today.
    const today = cells.find((cell) => cell.tabIndex === 0);
    expect(today).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/2 completions \(1 lesson, 1 challenge\), today$/),
    );

    const user = userEvent.setup();
    await user.tab();
    while (!grid.contains(document.activeElement)) await user.tab();
    expect(document.activeElement).toBe(today);
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toHaveAttribute("data-index", "22");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toHaveAttribute("data-index", "26");
    expect(screen.getByTestId("activity-detail")).toHaveTextContent(
      /1 completion \(1 Practice task\)$/,
    );
    await user.keyboard("{Home}");
    expect(document.activeElement).toHaveAttribute("data-index", "0");
    expect(screen.getByTestId("activity-detail")).toHaveTextContent(/no completions$/);
  });

  it("leaves migrated completions off the calendar, and says so", () => {
    const progress = {
      ...progressAfter([
        { type: "complete", content: { kind: "lesson", id: "git-init", type: "interactive" } },
      ]),
    };
    progress.completedChallenges = {
      "lost-commit": { completedAt: Date.now(), xp: 100, migrated: true },
    };
    showVisual(progress);
    expect(screen.getByTestId("activity-summary")).toHaveTextContent(
      "Active on 1 of the last 30 days · 1 completion",
    );
    expect(screen.getByTestId("activity-calendar")).toHaveTextContent(
      "1 completion from an older version of GitDojo has no date and isn't shown.",
    );
  });

  it("gives each skill its status in words and the item that moves it on", () => {
    showVisual(
      progressAfter([
        { type: "complete", content: { kind: "lesson", id: "git-branch", type: "interactive" } },
      ]),
    );
    const branches = within(skillCard("branches") ?? document.body);
    expect(branches.getByTestId("skill-status")).toHaveTextContent("Practiced");
    expect(
      branches.getByText("To master: 2 more hands-on items, 1 without step-by-step help"),
    ).toBeInTheDocument();
    expect(branches.getByTestId("skill-action")).toHaveAttribute(
      "href",
      "/practice/start-a-branch",
    );
    expect(branches.getByTestId("skill-action")).toHaveTextContent(
      "Solve it without step-by-step help: Start a Feature Branch · Practice task",
    );
    const repositories = within(skillCard("repositories") ?? document.body);
    expect(repositories.getByTestId("skill-action")).toHaveAttribute(
      "href",
      "/learn/git-basics/git-init",
    );
  });

  it("animates and announces a skill status change only when it happens", () => {
    const before = progressAfter([
      { type: "complete", content: { kind: "lesson", id: "what-is-git", type: "concept" } },
    ]);
    showVisual(before);
    const badge = () => within(skillCard("branches") ?? document.body).getByTestId("skill-status");
    expect(badge()).not.toHaveClass("animate-gd-pop");
    expect(screen.getByTestId("dashboard-announcement")).toBeEmptyDOMElement();

    // An unrelated change neither animates nor announces anything.
    act(() => {
      useProgressStore.setState({
        progress: applyProgressAction(before, { type: "playground-session" }, Date.now()),
      });
    });
    expect(badge()).not.toHaveClass("animate-gd-pop");

    act(() => {
      useProgressStore.setState({
        progress: applyProgressAction(
          before,
          { type: "complete", content: { kind: "practice", id: "start-a-branch" } },
          Date.now(),
        ),
      });
    });
    expect(badge()).toHaveTextContent("Practiced");
    expect(badge()).toHaveClass("animate-gd-pop");
    expect(screen.getByTestId("dashboard-announcement")).toHaveTextContent(
      "Branches: now practiced.",
    );
  });

  it("charts command use with the exact numbers beside each bar", () => {
    showVisual(
      progressAfter([
        { type: "command", command: "commit", ok: true },
        { type: "command", command: "commit", ok: false },
        { type: "command", command: "commit", ok: true },
        { type: "command", command: "commit", ok: true },
        { type: "command", command: "status", ok: true },
      ]),
    );
    const table = within(screen.getByTestId("command-usage"));
    const commit = table.getByRole("rowheader", { name: "git commit" }).closest("tr");
    expect(commit).toHaveTextContent("git commit43");
    const bars = table.getAllByTestId("command-bar");
    expect(bars[0]).toHaveStyle({ width: "100%" });
    expect(bars[1]).toHaveStyle({ width: "25%" });
    expect(bars[0]?.parentElement).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(/including ones that failed/)).toBeInTheDocument();
  });
});
