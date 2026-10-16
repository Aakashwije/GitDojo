import { expect, type Page, test } from "@playwright/test";
import { run, show, waitForTerminal } from "./helpers";

/** Rewrites the todo list in Git's editor dialog: `pick` becomes the action named for a subject. */
async function editTodo(page: Page, actions: Record<string, string | null>) {
  const dialog = page.getByTestId("git-editor");
  await expect(dialog).toContainText("git-rebase-todo");
  const text = dialog.getByTestId("git-editor-text");
  const todo = await text.inputValue();
  const edited = todo
    .split("\n")
    .flatMap((line) => {
      const match = /^pick (\S+) (.*)$/.exec(line);
      if (!match) return [line];
      const action = actions[match[2] ?? ""];
      if (action === null) return [];
      return [`${action ?? "pick"} ${match[1] ?? ""} ${match[2] ?? ""}`];
    })
    .join("\n");
  await text.fill(edited);
  await dialog.getByTestId("git-editor-save").click();
}

test("tidies history with an interactive rebase in the editor dialog", async ({
  page,
  isMobile,
}) => {
  await page.goto("/learn/recovery/git-rebase-interactive");
  await waitForTerminal(page, isMobile);
  await run(page, "git rebase -i main");
  await editTodo(page, {
    "Fix typo in search box": "fixup",
    "Add debug logging": null,
    wip: "reword",
  });

  const dialog = page.getByTestId("git-editor");
  await expect(dialog).toContainText("COMMIT_EDITMSG");
  await dialog.getByTestId("git-editor-text").fill("Highlight search matches\n");
  await dialog.getByTestId("git-editor-save").click();

  await expect(page.getByTestId("terminal")).toContainText(
    "Successfully rebased and updated refs/heads/feature/search.",
  );
  await expect(page.getByRole("dialog")).toContainText("Lesson Complete");
});

test("aborting from the editor leaves the branch exactly as it was", async ({ page, isMobile }) => {
  await page.goto("/learn/recovery/git-rebase-interactive");
  await waitForTerminal(page, isMobile);
  await run(page, "git rebase -i main");
  await page.getByTestId("git-editor").getByTestId("git-editor-abort").click();
  await expect(page.getByTestId("git-editor")).toHaveCount(0);
  await run(page, "git log --oneline");
  await expect(page.getByTestId("terminal")).toContainText("Add debug logging");
});

test("syncs with a simulated origin: a rejected push, a rebase pull, a push", async ({
  page,
  isMobile,
}) => {
  await page.goto("/learn/remotes/sync-with-remote");
  await waitForTerminal(page, isMobile);
  const terminal = page.getByTestId("terminal");
  await run(page, "git remote -v");
  await expect(terminal).toContainText("gitdojo://simulated/origin.git (fetch)");
  await run(page, "git push");
  await expect(terminal).toContainText("! [rejected]        main -> main (fetch first)");

  await show(page, "Files", isMobile);
  await expect(page.getByTestId("remote-list")).toContainText("Simulated remote");

  await show(page, "Terminal", isMobile);
  await run(page, "git pull --rebase");
  await expect(terminal).toContainText("Successfully rebased and updated refs/heads/main.");
  await run(page, "git push");
  await expect(page.getByRole("dialog")).toContainText("Lesson Complete");
});

test("tags a release and shows the tag in the graph", async ({ page, isMobile }) => {
  await page.goto("/learn/everyday-git/git-tag");
  await waitForTerminal(page, isMobile);
  await run(page, "git tag v0.9 HEAD~1");
  await run(page, 'git tag -a v1.0 -m "Version 1.0"');
  await run(page, "git tag -d temp-release");
  await expect(page.getByRole("dialog")).toContainText("Lesson Complete");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await show(page, "Graph", isMobile);
  await expect(page.locator('[data-testid="tag-label"][data-tag="v1.0"]')).toBeVisible();
});
