import { expect, test } from "@playwright/test";
import { run, show, waitForTerminal } from "./helpers";

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

test("offers a hint for the learner's state and drops it once resolved", async ({
  page,
  isMobile,
}) => {
  await page.goto("/learn/git-basics/git-add");
  await waitForTerminal(page, isMobile);
  // The first step asks for README.md; staging another file first is a common detour.
  await run(page, "git add index.js");

  await show(page, "Lesson", isMobile);
  const panel = page.getByTestId("hint-panel");
  const suggestion = panel.getByTestId("adaptive-hint");
  await expect(suggestion).toHaveAttribute("data-rule", "index-staged-first");
  await expect(suggestion).toContainText("Based on your progress");
  // It takes the place of the validator's reason, and gives nothing away until asked.
  await expect(panel.getByTestId("hint-missing")).toHaveCount(0);
  await expect(suggestion.getByTestId("adaptive-hint-step")).toHaveCount(0);

  await suggestion.getByRole("button", { name: "Show a hint based on your progress" }).click();
  await expect(suggestion.getByTestId("adaptive-hint-step").first()).toContainText(
    "index.js is staged already",
  );
  await suggestion.getByRole("button", { name: "Next hint based on your progress" }).click();
  await suggestion.getByRole("button", { name: "Show the answer based on your progress" }).click();
  await suggestion.getByTestId("confirm-answer").click();
  await expect(suggestion.getByTestId("adaptive-hint-step").last()).toContainText(
    "git add README.md",
  );

  await show(page, "Terminal", isMobile);
  await run(page, "git add README.md");
  await show(page, "Lesson", isMobile);
  // Both files are staged: two steps are done and the suggestion no longer applies.
  await expect(page.getByTestId("objective-stage-index")).toHaveAttribute(
    "data-state",
    "completed",
  );
  await expect(page.getByTestId("adaptive-hint")).toHaveCount(0);

  await show(page, "Terminal", isMobile);
  await run(page, "git add .");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Lesson Complete");
  // Adaptive hints count towards hints used like any other.
  await expect(dialog.getByTestId("hints-used")).toHaveText("3 hints used");
});
