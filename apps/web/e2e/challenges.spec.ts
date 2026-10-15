import { expect, test } from "@playwright/test";
import { run, show } from "./helpers";

test("solves a challenge from the browser and remembers it", async ({ page, isMobile }) => {
  await page.goto("/challenges");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Challenges");
  const card = page.locator('[data-challenge="detached-head"]');
  await expect(card).toHaveAttribute("data-state", "open");
  await card.getByRole("link", { name: "Start" }).click();

  await expect(page).toHaveURL(/\/challenges\/detached-head$/);
  await expect(page.getByTestId("challenge-context")).toContainText("Challenges · Branching");
  await show(page, "Lesson", isMobile);
  await expect(page.getByRole("heading", { name: "Mission" })).toBeVisible();

  await show(page, "Terminal", isMobile);
  const terminal = page.getByTestId("terminal");
  await expect(terminal).toContainText("learner@gitdojo");
  await run(page, "git status");
  await expect(terminal).toContainText("HEAD detached at");
  await run(page, "git switch -c fix/rounding");
  await run(page, "git switch main");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Challenge Solved");
  await dialog.getByRole("button", { name: "Close" }).click();

  await page.goto("/challenges");
  await expect(page.locator('[data-challenge="detached-head"]')).toHaveAttribute(
    "data-state",
    "solved",
  );
  await page.reload();
  await expect(page.locator('[data-challenge="detached-head"]')).toHaveAttribute(
    "data-state",
    "solved",
  );
});

test("explains a wrong turn, and changes what it says as the state changes", async ({
  page,
  isMobile,
}) => {
  await page.goto("/challenges/detached-head");
  await show(page, "Terminal", isMobile);
  await expect(page.getByTestId("terminal")).toContainText("learner@gitdojo");

  // Nothing is said before the learner has done anything.
  await show(page, "Lesson", isMobile);
  const tip = page.getByTestId("lesson-tip");
  await expect(tip).toHaveCount(0);

  // Leaving the detached HEAD first: no branch points at the rounding work any more.
  await show(page, "Terminal", isMobile);
  await run(page, "git switch main");
  await show(page, "Lesson", isMobile);
  await expect(tip).toHaveAttribute("data-tip", "left-detached");
  await expect(tip).toContainText("Worth checking");
  await expect(tip).toContainText("fix/rounding");

  // Creating the branch from here resolves that note, and raises the more specific one.
  await show(page, "Terminal", isMobile);
  await run(page, "git switch -c fix/rounding");
  await show(page, "Lesson", isMobile);
  await expect(tip).toHaveAttribute("data-tip", "branch-missed-the-work");
  await expect(tip).toContainText("Fix rounding of totals");
});

test("offers a spoiler-free hint for a stuck state in a challenge", async ({ page, isMobile }) => {
  await page.goto("/challenges/wrong-branch");
  await show(page, "Terminal", isMobile);
  await expect(page.getByTestId("terminal")).toContainText("learner@gitdojo");
  // The commits are safe on a new branch, but HEAD went with them.
  await run(page, "git switch -c feature/login");

  await show(page, "Lesson", isMobile);
  const suggestion = page.getByTestId("adaptive-hint");
  await expect(suggestion).toHaveAttribute("data-rule", "on-new-branch");
  await suggestion.getByRole("button", { name: "Show a hint based on your progress" }).click();
  await suggestion.getByRole("button", { name: "Next hint based on your progress" }).click();
  const steps = suggestion.getByTestId("adaptive-hint-step");
  await expect(steps).toHaveCount(2);
  // Challenges never reach the answer, and never spell out a command.
  await expect(suggestion.getByRole("button")).toHaveCount(0);
  await expect(steps.filter({ hasText: /git [a-z]/ })).toHaveCount(0);

  await show(page, "Terminal", isMobile);
  await run(page, "git switch main");
  await show(page, "Lesson", isMobile);
  await expect(page.getByTestId("adaptive-hint")).toHaveCount(0);
});
