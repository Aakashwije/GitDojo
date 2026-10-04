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
