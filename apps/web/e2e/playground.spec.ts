import { expect, test, type Page } from "@playwright/test";

type Tab = "Editor" | "Terminal" | "Graph" | "Files";

async function show(page: Page, tab: Tab, isMobile: boolean) {
  if (isMobile)
    await page
      .getByRole("navigation", { name: "Workspace panels" })
      .getByRole("button", { name: tab })
      .click();
}

async function run(page: Page, command: string) {
  await page.getByTestId("terminal").click();
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
}

test("keeps the repository across reloads, loads scenarios and resets", async ({
  page,
  isMobile,
}) => {
  await page.goto("/playground");
  await show(page, "Terminal", isMobile);
  const terminal = page.getByTestId("terminal");
  await expect(terminal).toContainText("learner@gitdojo");
  await expect(page.getByTestId("playground-scenario")).toHaveText("Simple Repository");

  await run(page, "git switch -c experiment");
  await expect(terminal).toContainText("Switched to a new branch 'experiment'");

  // Everything lives in IndexedDB: a reload continues where we were.
  await page.reload();
  await show(page, "Terminal", isMobile);
  await expect(terminal).toContainText("learner@gitdojo");
  await expect(page.getByTestId("playground-scenario")).toContainText("Restored");
  await show(page, "Graph", isMobile);
  await expect(page.getByTestId("current-branch")).toHaveText("experiment");

  // Load another scenario.
  await page.getByRole("button", { name: "Scenarios" }).click();
  await page
    .locator('[data-scenario="detached-head"]')
    .getByRole("button", { name: "Load" })
    .click();
  await expect(page.getByTestId("playground-scenario")).toHaveText("Detached HEAD");
  await show(page, "Terminal", isMobile);
  await run(page, "git status");
  await expect(terminal).toContainText("HEAD detached at");

  // Reset goes back to the scenario's start.
  await run(page, "git switch main");
  await expect(terminal).toContainText("Switched to branch 'main'");
  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("button", { name: "Reset repository" }).click();
  await run(page, "git branch");
  await expect(terminal).toContainText("* (HEAD detached at");

  const download = page.waitForEvent("download");
  await page.getByTestId("export-snapshot").click();
  expect((await download).suggestedFilename()).toMatch(/^gitdojo-playground-.*\.json$/);
});
