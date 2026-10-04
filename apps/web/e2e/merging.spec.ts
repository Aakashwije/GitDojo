import { expect, test } from "@playwright/test";
import { run, show } from "./helpers";

test("fast-forwards main to a feature branch", async ({ page, isMobile }) => {
  await page.goto("/learn/merging/fast-forward-merge");
  await show(page, "Terminal", isMobile);
  const terminal = page.getByTestId("terminal");
  await expect(terminal).toContainText("learner@gitdojo");

  await run(page, "git merge feature/login");
  await expect(terminal).toContainText("Fast-forward");
  await expect(page.getByTestId("objective-fast-forward")).toHaveAttribute(
    "data-state",
    "completed",
  );

  // Both labels now sit on the same commit, in a single lane.
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await show(page, "Graph", isMobile);
  const graph = page.getByTestId("commit-graph");
  const top = graph.getByTestId("commit-row").first();
  await expect(top.locator('[data-branch="main"]')).toBeVisible();
  await expect(top.locator('[data-branch="feature/login"]')).toBeVisible();
  await expect(graph.locator('[data-testid="commit-row"][data-lane="1"]')).toHaveCount(0);
});

test("resolves a merge conflict by hand in the editor", async ({ page, isMobile }) => {
  await page.goto("/learn/merge-conflicts/resolve-first-conflict");
  await show(page, "Terminal", isMobile);
  const terminal = page.getByTestId("terminal");
  await expect(terminal).toContainText("learner@gitdojo");

  await run(page, "git merge feature/login");
  await expect(terminal).toContainText("CONFLICT (content): Merge conflict in src/auth.ts");
  const banner = page.getByTestId("conflict-banner");
  await expect(banner).toHaveAttribute("data-state", "conflicted");
  await expect(banner).toContainText("Conflict detected");
  await expect(page.getByTestId("objective-conflict")).toHaveAttribute("data-state", "completed");

  // Nothing is resolved automatically: the file opens with Git's markers.
  await banner.getByTestId("open-conflict").click();
  const editor = page.getByTestId("conflict-editor");
  const input = editor.getByTestId("conflict-editor-input");
  await expect(input).toHaveValue(/<<<<<<< HEAD\nexport const timeout = 15;\n=======/);
  await expect(editor.getByTestId("conflict-marker-status")).toHaveText("1 conflict left");

  await input.fill(
    'export const provider = "password";\n// Session settings\nexport const timeout = 60;\nexport const rememberMe = true;\n',
  );
  await expect(editor.getByTestId("conflict-marker-status")).toHaveText("No markers left");
  await editor.getByTestId("save-conflict").click();
  await expect(editor.getByTestId("conflict-save-hint")).toContainText("git add src/auth.ts");
  await editor.getByRole("button", { name: "Close" }).first().click();

  await show(page, "Terminal", isMobile);
  await run(page, "git add src/auth.ts");
  await expect(banner).toHaveAttribute("data-state", "resolved");
  await run(page, "git commit");
  await expect(terminal).toContainText("Merge branch 'feature/login'");
  await expect(banner).toHaveCount(0);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Lesson Complete");
  await dialog.getByRole("button", { name: "Close" }).click();

  await show(page, "Graph", isMobile);
  await expect(
    page.getByTestId("commit-graph").getByRole("button", { name: /^Merge commit/ }),
  ).toHaveCount(1);
});
