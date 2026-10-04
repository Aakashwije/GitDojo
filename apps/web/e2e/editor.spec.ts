import { expect, test, type Page } from "@playwright/test";

/** Phones show one panel at a time; switch to it before interacting. */
async function show(page: Page, tab: "Terminal" | "Files", isMobile: boolean) {
  if (isMobile)
    await page
      .getByRole("navigation", { name: "Workspace panels" })
      .getByRole("button", { name: tab })
      .click();
}

async function run(page: Page, command: string) {
  await page.getByTestId("workbench-tab-terminal").click();
  await page.getByTestId("terminal").click();
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
}

test("edits a committed file in the editor and sees it become modified", async ({
  page,
  isMobile,
}) => {
  await page.goto("/learn/git-basics/git-log");
  await show(page, "Terminal", isMobile);
  await expect(page.getByTestId("terminal")).toContainText("learner@gitdojo");

  await page.getByTestId("workbench-tab-editor").click();
  const explorer = page.getByRole("tree", { name: "Project files" });
  await expect(explorer.getByTestId("explorer-file")).toHaveCount(4);
  // The uncommitted changelog is untracked; committed files have no letter.
  await expect(
    explorer.locator('[data-path="CHANGELOG.md"]').getByTestId("file-status"),
  ).toHaveAttribute("data-letter", "U");

  await explorer.getByTitle("Open README.md").click();
  const editor = page.getByTestId("code-editor");
  await expect(editor.locator(".view-lines")).toContainText("# Weather App");

  // Monaco is a real editor: type at the end of the file.
  await editor.locator(".view-lines").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("Forecasts for every city.\n");
  await expect(page.getByTestId("editor-save-status")).toHaveText("Saved");
  await expect(
    explorer.locator('[data-path="README.md"]').getByTestId("file-status"),
  ).toHaveAttribute("data-letter", "M");

  await show(page, "Files", isMobile);
  await expect(
    page.getByTestId("working-tree-panel").locator('[data-path="README.md"]'),
  ).toHaveAttribute("data-status", "modified");

  // Git sees exactly what was typed, and `git restore`-style changes flow back into the editor.
  await show(page, "Terminal", isMobile);
  await run(page, "git status");
  await expect(page.getByTestId("terminal")).toContainText("modified:   README.md");
});

test("creates a new file from the explorer", async ({ page, isMobile }) => {
  await page.goto("/learn/git-basics/git-log");
  await show(page, "Terminal", isMobile);
  await expect(page.getByTestId("terminal")).toContainText("learner@gitdojo");

  await page.getByTestId("workbench-tab-editor").click();
  await page.getByRole("button", { name: "New file" }).click();
  await page.getByRole("textbox", { name: "New file name" }).fill("src/notes.md");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("editor-tab")).toHaveAttribute("data-path", "src/notes.md");
  await expect(
    page
      .getByRole("tree", { name: "Project files" })
      .locator('[data-path="src/notes.md"]')
      .getByTestId("file-status"),
  ).toHaveAttribute("data-letter", "U");
});
