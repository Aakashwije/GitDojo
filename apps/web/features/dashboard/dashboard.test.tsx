import {
  applyProgressAction,
  createMemoryStorage,
  emptyProgress,
  ProgressRepository,
  type LocalProgress,
  type ProgressAction,
  type ProgressCatalog,
} from "@gitdojo/progress";
import { render, screen, waitFor, within } from "@testing-library/react";
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
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent(
      "Learning progress reset.",
    );
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
