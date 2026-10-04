import { expect, test } from "@playwright/test";
import { run, show } from "./helpers";

test("climbs the hint ladder from concept to answer", async ({ page, isMobile }) => {
  await page.goto("/learn/demo");
  await show(page, "Terminal", isMobile);
  await expect(page.getByTestId("terminal")).toContainText("learner@gitdojo");
  await run(page, "git status");

  await show(page, "Lesson", isMobile);
  const panel = page.getByTestId("hint-panel");
  // After a first try, the panel says what is still missing.
  await expect(panel.getByTestId("hint-missing")).toContainText("not a Git repository yet");

  await panel.getByRole("button", { name: "Show a hint" }).click();
  await expect(panel.getByTestId("hint").first()).toHaveAttribute("data-level", "1");
  await panel.getByRole("button", { name: "Next hint" }).click();
  await expect(panel.getByTestId("hint").nth(1)).toHaveAttribute("data-level", "2");
  // The exact command needs a second, deliberate click.
  await panel.getByRole("button", { name: "Show the answer" }).click();
  await expect(panel.getByRole("group", { name: "Show the answer?" })).toBeVisible();
  await panel.getByTestId("confirm-answer").click();
  await expect(panel.getByTestId("hint").last()).toHaveAttribute("data-level", "3");
  await expect(panel.getByTestId("hint").last()).toContainText("git init");

  await show(page, "Terminal", isMobile);
  await run(page, "git init");
  await run(page, "git add README.md");
  await run(page, 'git commit -m "Initial commit"');
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Lesson Complete");
  await expect(dialog.getByTestId("hints-used")).toHaveText("3 hints used");
});
