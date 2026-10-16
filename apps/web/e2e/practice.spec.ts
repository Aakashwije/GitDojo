import { expect, test } from "@playwright/test";
import { run, show, stat, waitForProgressSaved, waitForTerminal } from "./helpers";

test("practice mode: pick a topic, solve a task unguided, and see it on the dashboard", async ({
  page,
  isMobile,
}) => {
  await page.goto("/practice");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Practice");
  await page.getByLabel("Topic").selectOption("tags");
  const card = page.locator('[data-testid="practice-card"][data-task="tag-a-release"]');
  await expect(card).toHaveAttribute("data-state", "open");
  await card.getByRole("link", { name: "Start: Tag a Release" }).click();
  await expect(page).toHaveURL(/\/practice\/tag-a-release$/);

  // A mission and no step-by-step objectives or hints.
  await show(page, "Task", isMobile);
  const panel = page.getByTestId("practice-panel");
  await expect(panel).toContainText("Your mission");
  await expect(panel.getByRole("button", { name: /hint/i })).toHaveCount(0);
  await panel.getByTestId("practice-check").click();
  await expect(panel.getByTestId("practice-feedback")).toContainText("Not yet.");

  await waitForTerminal(page, isMobile);
  await run(page, 'git tag -a v2.0 -m "Version 2.0"');
  await run(page, "git tag -d v2.0-rc");
  await show(page, "Task", isMobile);
  await expect(page.getByTestId("practice-status")).toContainText("Solved");
  await waitForProgressSaved(page);

  await page.goto("/dashboard");
  await expect(stat(page, "practice")).toHaveText("1");
  await expect(page.getByTestId("recent-activity")).toContainText("Practice · no XP");
  await expect(page.locator('[data-testid="skill"][data-skill="tags"]')).toHaveAttribute(
    "data-status",
    "practiced",
  );
});

test("surprise me opens a task, and an unknown task is a 404", async ({ page }) => {
  await page.goto("/practice");
  await page.getByTestId("surprise-me").click();
  await expect(page).toHaveURL(/\/practice\/[a-z0-9-]+$/);
  await expect(page.getByTestId("practice-title")).not.toBeEmpty();

  const response = await page.goto("/practice/no-such-task");
  expect(response?.status()).toBe(404);
});
