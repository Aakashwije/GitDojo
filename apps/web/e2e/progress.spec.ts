import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { run, show, solveLesson, stat, waitForProgressSaved, waitForTerminal } from "./helpers";

// Every test gets a fresh browser context, so IndexedDB and localStorage start empty.

const DEMO = ["git init", "git add README.md", 'git commit -m "Initial commit"'];

/** Git Basics in course order, with a reference solution for each hands-on lesson. */
const GIT_BASICS: { slug: string; commands?: string[] }[] = [
  { slug: "what-is-git" },
  { slug: "git-vs-github" },
  { slug: "git-init", commands: ["git init"] },
  {
    slug: "git-status",
    commands: [
      "git status",
      "git add README.md",
      "git add todo.txt",
      'git commit -m "Update README and add todo list"',
    ],
  },
  { slug: "working-tree" },
  { slug: "staging-area" },
  { slug: "git-add", commands: ["git add README.md", "git add index.js", "git add ."] },
  {
    slug: "git-commit",
    commands: [
      "git add README.md",
      'git commit -m "Add README"',
      "git add index.js",
      'git commit -m "Add app entry point"',
    ],
  },
  {
    slug: "git-log",
    commands: ["git log", "git add CHANGELOG.md", 'git commit -m "Add changelog"'],
  },
  {
    slug: "first-repository-challenge",
    commands: ["git init", "git add .", 'git commit -m "Initial commit"'],
  },
];

/** Opens the dashboard once earlier activity is saved (navigating away mid-write could lose it). */
async function openDashboard(page: Page) {
  if (page.url().startsWith("http")) await waitForProgressSaved(page);
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard")).toBeVisible();
}

async function exportedProgress(page: Page): Promise<Record<string, unknown>> {
  const download = page.waitForEvent("download");
  await page.getByTestId("export-progress").click();
  const file = await (await download).path();
  const data = JSON.parse(await readFile(file, "utf8")) as {
    format: string;
    progress: Record<string, unknown>;
  };
  expect(data.format).toBe("gitdojo-progress");
  return data.progress;
}

test("shows a helpful empty state to a new learner", async ({ page }) => {
  await openDashboard(page);
  await expect(page.getByTestId("dashboard-empty")).toContainText("Welcome to GitDojo");
  await expect(stat(page, "xp")).toHaveText("0");
  await expect(page.getByTestId("continue-learning")).toHaveAttribute(
    "href",
    "/learn/git-basics/what-is-git",
  );
});

test("completes the Git Basics course and the dashboard adds it up", async ({ page, isMobile }) => {
  test.slow();
  let commands = 0;
  await page.goto("/learn/git-basics/what-is-git");
  // Walk the course as a learner would, following each completion's "next" link.
  for (const lesson of GIT_BASICS) {
    await expect(page).toHaveURL(new RegExp(`/learn/git-basics/${lesson.slug}$`));
    if (lesson.commands) {
      await solveLesson(page, lesson.commands, isMobile);
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByTestId("xp-award")).toHaveText(
        lesson.slug === "first-repository-challenge" ? "+100 XP" : "+50 XP",
      );
      commands += lesson.commands.length;
      await dialog.getByTestId("complete-next").click();
    } else {
      await page.getByTestId("mark-complete").click();
      await expect(page.getByTestId("concept-completion")).toContainText("+25 XP");
      await page.getByTestId("concept-continue").click();
    }
  }

  // The last lesson leads back to the course page.
  await expect(page).toHaveURL(/\/learn\/git-basics$/);
  await expect(page.getByTestId("course-percent")).toHaveText("100%");

  await openDashboard(page);
  // 4 concept lessons × 25 + 5 interactive × 50 + 1 challenge lesson × 100.
  await expect(stat(page, "xp")).toHaveText("450");
  await expect(stat(page, "lessons")).toHaveText("10");
  // The course's challenge lesson is a lesson, not a standalone challenge.
  await expect(stat(page, "challenges")).toHaveText("0");
  await expect(stat(page, "commands")).toHaveText(String(commands));
  await expect(page.locator('[data-course="git-basics"]').getByTestId("course-percent")).toHaveText(
    "100%",
  );
  await expect(page.getByTestId("continue-learning")).toHaveAttribute(
    "href",
    "/learn/branching/what-is-a-branch",
  );
});

test("replaying a lesson never awards XP twice, and progress survives a reload", async ({
  page,
  isMobile,
}) => {
  await page.goto("/learn/demo");
  await solveLesson(page, DEMO, isMobile);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("xp-award")).toHaveText("+50 XP");

  // Practice again and finish a second time.
  await dialog.getByRole("button", { name: "Practice again" }).click();
  await expect(dialog).toBeHidden();
  await solveLesson(page, ["git status", ...DEMO], isMobile);
  await expect(dialog.getByTestId("xp-award")).toContainText("Already completed: no new XP");

  await openDashboard(page);
  await expect(stat(page, "xp")).toHaveText("50");
  await expect(stat(page, "lessons")).toHaveText("1");
  // Every submitted Git command counts once; `git status` before `git init` failed.
  await expect(stat(page, "commands")).toHaveText("7");
  await expect(page.getByTestId("stat-commands").locator("..")).toContainText("6 succeeded");
  await expect(page.getByTestId("recent-activity")).toContainText("Your First Commit");

  await waitForProgressSaved(page);
  await page.reload();
  await expect(stat(page, "xp")).toHaveText("50");
  await expect(stat(page, "commands")).toHaveText("7");
});

test("a standalone challenge counts once, separately from lessons", async ({ page, isMobile }) => {
  await page.goto("/challenges/detached-head");
  await waitForTerminal(page, isMobile);
  await run(page, "git switch -c fix/rounding");
  await run(page, "git switch main");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Challenge Solved");
  await expect(dialog.getByTestId("xp-award")).toHaveText("+100 XP");

  await openDashboard(page);
  await expect(stat(page, "challenges")).toHaveText("1");
  await expect(stat(page, "lessons")).toHaveText("0");
  await expect(stat(page, "xp")).toHaveText("100");
});

test("counts each revealed hint once", async ({ page, isMobile }) => {
  await page.goto("/learn/demo");
  await waitForTerminal(page, isMobile);
  await show(page, "Lesson", isMobile);
  const panel = page.getByTestId("hint-panel");
  await panel.getByRole("button", { name: "Show a hint" }).click();
  await panel.getByRole("button", { name: "Next hint" }).click();
  await expect(panel.getByTestId("hint")).toHaveCount(2);

  // After a reload the panel starts over; showing the same hint again is not new usage.
  await waitForProgressSaved(page);
  await page.reload();
  await waitForTerminal(page, isMobile);
  await show(page, "Lesson", isMobile);
  await panel.getByRole("button", { name: "Show a hint" }).click();
  await expect(panel.getByTestId("hint")).toHaveCount(1);

  await openDashboard(page);
  const progress = await exportedProgress(page);
  expect(progress.revealedHints).toEqual({
    "lesson:first-commit": ["initialize#0", "initialize#1"],
  });
  // Hints never cost XP.
  expect(progress.xp).toBe(0);
});

test("resetting learning progress keeps the playground repository", async ({ page, isMobile }) => {
  await page.goto("/playground");
  await waitForTerminal(page, isMobile);
  await run(page, "git switch -c experiment");
  await expect(page.getByTestId("terminal")).toContainText("Switched to a new branch");

  await openDashboard(page);
  await expect(stat(page, "playground")).toHaveText("1");
  await expect(stat(page, "commands")).toHaveText("1");

  await page.getByTestId("reset-progress").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Reset learning progress?");
  // Nothing happens without confirming.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(stat(page, "playground")).toHaveText("1");

  await page.getByTestId("reset-progress").click();
  await dialog.getByTestId("confirm-reset-progress").click();
  await expect(dialog).toBeHidden();
  await expect(stat(page, "playground")).toHaveText("0");
  await expect(stat(page, "commands")).toHaveText("0");
  await expect(page.getByTestId("dashboard-empty")).toBeVisible();

  // The playground repository is still there.
  await page.goto("/playground");
  await waitForTerminal(page, isMobile);
  await expect(page.getByTestId("playground-scenario")).toContainText("Restored");
  await show(page, "Graph", isMobile);
  await expect(page.getByTestId("current-branch")).toHaveText("experiment");
});

test("migrates progress saved by earlier versions", async ({ page }) => {
  await page.addInitScript(() => {
    // Only seed once: the migration removes this entry.
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(
      "gitdojo:course-progress",
      JSON.stringify({
        state: {
          completedLessons: { "what-is-git": true, "git-init": true },
          completedChallenges: { "detached-head": true },
        },
        version: 2,
      }),
    );
  });
  await openDashboard(page);
  // 25 (concept) + 50 (interactive) + 100 (challenge), once.
  await expect(stat(page, "xp")).toHaveText("175");
  await expect(stat(page, "lessons")).toHaveText("2");
  await expect(stat(page, "challenges")).toHaveText("1");
  await expect(page.getByTestId("recent-activity")).toContainText("Completed earlier");
  expect(await page.evaluate(() => localStorage.getItem("gitdojo:course-progress"))).toBeNull();

  await page.reload();
  await expect(stat(page, "xp")).toHaveText("175");
  await page.goto("/learn/git-basics");
  await expect(page.getByTestId("course-percent")).toHaveText("20%");
});

test("continue learning returns to the last visited lesson", async ({ page }) => {
  await page.goto("/learn/branching/understanding-head");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await openDashboard(page);
  await expect(page.getByTestId("continue-title")).toHaveText("Understanding HEAD");
  await expect(page.getByTestId("continue-learning")).toHaveAttribute(
    "href",
    "/learn/branching/understanding-head",
  );
});
