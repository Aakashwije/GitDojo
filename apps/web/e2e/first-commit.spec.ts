import { expect, test, type Page } from "@playwright/test";

type Tab = "Lesson" | "Terminal" | "Graph" | "Files";

/** Phones show one panel at a time; switch to it before interacting. */
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

test("completes the first-commit lesson end to end", async ({ page, isMobile }) => {
  await page.goto("/learn/demo");
  await expect(page.getByRole("heading", { name: "Your First Commit" })).toBeAttached();

  const terminal = page.getByTestId("terminal");
  await show(page, "Terminal", isMobile);
  await expect(terminal).toContainText("learner@gitdojo");

  // Before `git init` there is no repository.
  await run(page, "git status");
  await expect(terminal).toContainText("fatal: not a git repository");

  await run(page, "git init");
  await expect(terminal).toContainText("Initialized empty Git repository");
  await expect(page.getByTestId("objective-initialize")).toHaveAttribute("data-state", "completed");

  await run(page, "git status");
  await expect(terminal).toContainText("Untracked files:");

  await show(page, "Files", isMobile);
  await expect(
    page.getByTestId("working-tree-panel").getByTestId("file-row").filter({ hasText: "README.md" }),
  ).toHaveAttribute("data-status", "untracked");

  await show(page, "Terminal", isMobile);
  await run(page, "git add README.md");
  await expect(page.getByTestId("objective-stage-readme")).toHaveAttribute(
    "data-state",
    "completed",
  );

  await show(page, "Files", isMobile);
  await expect(page.getByTestId("staging-area-panel")).toContainText("README.md");
  await expect(page.getByTestId("working-tree-panel")).toContainText("No unstaged changes");

  await show(page, "Terminal", isMobile);
  await run(page, 'git commit -m "Initial commit"');
  await expect(terminal).toContainText("(root-commit)");
  await expect(page.getByTestId("objective-first-commit")).toHaveAttribute(
    "data-state",
    "completed",
  );

  // Lesson completion dialog.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Lesson Complete");
  await expect(dialog).toContainText("+100 XP");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();

  // Commit graph shows the commit on main, and clicking it opens the details.
  await show(page, "Graph", isMobile);
  const graph = page.getByTestId("commit-graph");
  await expect(graph.getByTestId("commit-node")).toHaveCount(1);
  await expect(graph).toContainText("Initial commit");
  await expect(graph).toContainText("main");
  await expect(graph).toContainText("HEAD");
  await graph.getByTestId("commit-node").click();
  await expect(page.getByTestId("commit-details")).toContainText("GitDojo Learner");

  await show(page, "Files", isMobile);
  await expect(page.getByTestId("staging-area-panel")).toContainText("No staged changes");
  await expect(page.getByTestId("repository-panel")).toContainText("Initial commit");

  await show(page, "Lesson", isMobile);
  await expect(page.getByTestId("lesson-complete")).toBeVisible();
});

test("validates state, not command text: `git add .` stages README.md", async ({
  page,
  isMobile,
}) => {
  await page.goto("/learn/demo");
  await show(page, "Terminal", isMobile);
  await expect(page.getByTestId("terminal")).toContainText("learner@gitdojo");
  await run(page, "git init");
  await run(page, "git add .");
  await expect(page.getByTestId("objective-stage-readme")).toHaveAttribute(
    "data-state",
    "completed",
  );
});

test("reset restores the original lesson state", async ({ page, isMobile }) => {
  await page.goto("/learn/demo");
  await show(page, "Terminal", isMobile);
  await expect(page.getByTestId("terminal")).toContainText("learner@gitdojo");
  await run(page, "git init");
  await expect(page.getByTestId("objective-initialize")).toHaveAttribute("data-state", "completed");

  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset lesson" }).click();
  await expect(page.getByTestId("objective-initialize")).toHaveAttribute("data-state", "current");

  await run(page, "git status");
  await expect(page.getByTestId("terminal")).toContainText("fatal: not a git repository");
});

test("landing page links to the course list", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Learn Git by doing.");
  await page.getByRole("link", { name: "Start learning" }).first().click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Learn Git");
});
