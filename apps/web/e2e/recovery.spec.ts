import { expect, test, type Page } from "@playwright/test";

type Tab = "Lesson" | "Terminal" | "Graph" | "Files";

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

test("recovers commits lost to a hard reset through the reflog", async ({ page, isMobile }) => {
  await page.goto("/learn/recovery/git-reflog");
  await show(page, "Terminal", isMobile);
  const terminal = page.getByTestId("terminal");
  await expect(terminal).toContainText("learner@gitdojo");

  await show(page, "Graph", isMobile);
  const graph = page.getByTestId("commit-graph");
  await expect(graph.getByTestId("commit-row")).toHaveCount(2);

  await show(page, "Terminal", isMobile);
  await run(page, "git reflog");
  await expect(terminal).toContainText("HEAD@{0}: reset: moving to HEAD~2");
  await expect(terminal).toContainText("HEAD@{1}: commit: Validate card numbers");
  await run(page, "git reset --hard HEAD@{1}");
  await expect(terminal).toContainText("HEAD is now at");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Lesson Complete");
  await dialog.getByRole("button", { name: "Close" }).click();
  await show(page, "Graph", isMobile);
  await expect(graph.getByTestId("commit-row")).toHaveCount(4);
});

test("shelves work in the stash and brings it back", async ({ page, isMobile }) => {
  await page.goto("/learn/recovery/git-stash");
  await show(page, "Terminal", isMobile);
  const terminal = page.getByTestId("terminal");
  await expect(terminal).toContainText("learner@gitdojo");

  await run(page, "git switch main");
  await expect(terminal).toContainText(
    "error: Your local changes to the following files would be overwritten by checkout",
  );
  await run(page, "git stash");
  await expect(terminal).toContainText(
    "Saved working directory and index state WIP on feature/profile",
  );

  await show(page, "Files", isMobile);
  await expect(page.getByTestId("stash-list")).toContainText("stash@{0}");
  await expect(page.getByTestId("working-tree-panel")).toContainText("No unstaged changes");

  await show(page, "Terminal", isMobile);
  await run(page, "git switch main");
  await run(page, "git switch feature/profile");
  await run(page, "git stash pop");
  await expect(terminal).toContainText("Dropped refs/stash@{0}");

  await expect(page.getByRole("dialog")).toContainText("Lesson Complete");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await show(page, "Files", isMobile);
  await expect(page.getByTestId("stash-list")).toHaveCount(0);
  await expect(
    page.getByTestId("working-tree-panel").locator('[data-path="profile.js"]'),
  ).toHaveAttribute("data-status", "modified");
});

test("shows a unified diff", async ({ page, isMobile }) => {
  await page.goto("/learn/recovery/git-diff");
  await show(page, "Terminal", isMobile);
  const terminal = page.getByTestId("terminal");
  await expect(terminal).toContainText("learner@gitdojo");
  await run(page, "git diff src/price.js");
  await expect(terminal).toContainText("@@ -1,3 +1,3 @@");
  await expect(terminal).toContainText(
    "+  return items.reduce((sum, item) => sum + item.price, 0);",
  );
});
