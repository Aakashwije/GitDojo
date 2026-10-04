import { expect, test } from "@playwright/test";
import { run, show } from "./helpers";

test("explains why a command failed, next to Git's real message", async ({ page, isMobile }) => {
  await page.goto("/learn/demo");
  await show(page, "Terminal", isMobile);
  const terminal = page.getByTestId("terminal");
  await expect(terminal).toContainText("learner@gitdojo");

  await run(page, "git status");
  // The terminal stays realistic...
  await expect(terminal).toContainText("fatal: not a git repository");
  // ...and the explanation is shown beside it.
  const panel = page.getByTestId("error-explanation");
  await expect(panel).toHaveAttribute("data-code", "NOT_A_REPOSITORY");
  await panel.getByRole("button", { name: /Why did this happen/ }).click();
  await expect(panel).toContainText("Run git init to turn this folder into a repository.");

  await run(page, "git init");
  await expect(panel).toHaveCount(0);

  await run(page, "git stauts");
  await expect(panel).toHaveAttribute("data-code", "UNKNOWN_GIT_COMMAND");
  await panel.getByRole("button", { name: /Why did this happen/ }).click();
  await expect(panel).toContainText("Did you mean status?");
});
