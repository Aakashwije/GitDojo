import { expect, test } from "@playwright/test";
import { run, show } from "./helpers";

test("works through concept lessons and tracks course progress", async ({ page }) => {
  await page.goto("/learn");
  const card = page.getByTestId("course-card").filter({ hasText: "Git Basics" });
  await expect(card).toContainText("10 lessons");
  await card.getByRole("link", { name: "Start" }).click();

  await expect(page).toHaveURL(/\/learn\/git-basics\/what-is-git$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What is Git?");
  await expect(page.getByTestId("course-navigation")).toContainText("Lesson 01 of 10");
  // Concept lessons have no terminal.
  await expect(page.getByTestId("terminal")).toHaveCount(0);
  await expect(page.getByTestId("demo-graph").first()).toHaveAttribute(
    "aria-label",
    /main points to "Fix typo"\. HEAD points to main/,
  );

  await page.getByTestId("mark-complete").click();
  await expect(page.getByTestId("concept-completion")).toContainText("Lesson complete");
  await page.getByTestId("concept-continue").click();

  await expect(page).toHaveURL(/\/learn\/git-basics\/git-vs-github$/);
  await expect(page.getByTestId("previous-lesson")).toContainText("What is Git?");

  // The outline marks finished, current and upcoming lessons.
  await page.getByTestId("course-navigation").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("course-percent")).toHaveText("10%");
  const lessons = dialog.getByTestId("course-lesson");
  await expect(lessons.nth(0)).toHaveAttribute("data-status", "completed");
  await expect(lessons.nth(1)).toHaveAttribute("data-status", "current");
  await expect(lessons.nth(2)).toHaveAttribute("data-status", "upcoming");

  // Progress survives a reload and shows on the course page.
  await page.goto("/learn/git-basics");
  await expect(page.getByTestId("course-percent")).toHaveText("10%");
  await expect(page.getByTestId("continue-course")).toHaveAttribute(
    "href",
    "/learn/git-basics/git-vs-github",
  );
});

test("steps through a visual demo", async ({ page }) => {
  await page.goto("/learn/git-basics/staging-area");
  const demo = page.getByTestId("demo-player");
  await expect(demo.getByTestId("demo-step")).toHaveText("Step 1 of 5");
  await demo.getByRole("button", { name: "Next" }).click();
  await expect(demo.getByTestId("demo-step")).toHaveText("Step 2 of 5");
  await expect(demo).toContainText("git add login.js");
  await expect(demo.getByRole("region", { name: "Staging Area" })).toContainText("login.js");
});

test("commits on a feature branch and sees it in the graph", async ({ page, isMobile }) => {
  await page.goto("/learn/branching/commit-on-branch");
  await expect(page.getByRole("heading", { name: "Commit on a Feature Branch" })).toBeAttached();

  await show(page, "Terminal", isMobile);
  const terminal = page.getByTestId("terminal");
  await expect(terminal).toContainText("learner@gitdojo");

  await run(page, "git switch -c feature/login");
  await expect(terminal).toContainText("Switched to a new branch 'feature/login'");
  await expect(page.getByTestId("objective-on-feature")).toHaveAttribute("data-state", "completed");

  await run(page, "git add login.js");
  await run(page, 'git commit -m "Add login page"');
  await expect(page.getByTestId("objective-main-untouched")).toHaveAttribute(
    "data-state",
    "completed",
  );

  // Two lines of work: main stays behind, HEAD follows the feature branch.
  await show(page, "Graph", isMobile);
  const graph = page.getByTestId("commit-graph");
  await expect(graph.getByTestId("commit-node")).toHaveCount(3);
  await expect(graph.locator('[data-branch="feature/login"][data-current]')).toBeVisible();
  await expect(graph.locator('[data-branch="main"]')).toBeVisible();
  await expect(graph.locator('[data-testid="commit-row"][data-lane="1"]')).toHaveCount(1);
  await expect(page.getByTestId("current-branch")).toHaveText("feature/login");

  await show(page, "Terminal", isMobile);
  await run(page, "git switch main");
  await expect(terminal).toContainText("Switched to branch 'main'");
  await expect(page.getByTestId("current-branch")).toHaveText("main");

  // The completion dialog leads on to the next lesson.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Lesson Complete");
  await expect(dialog.getByTestId("complete-next")).toHaveAttribute(
    "href",
    "/learn/branching/branching-challenge",
  );

  // login.js is committed on feature/login only, so it left the working tree.
  await dialog.getByRole("button", { name: "Close" }).click();
  await show(page, "Files", isMobile);
  await expect(page.getByTestId("working-tree-panel")).not.toContainText("login.js");
});
