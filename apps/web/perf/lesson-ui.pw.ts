/**
 * The lesson UI in a real browser: how long a reading page takes to become usable, how long a
 * demo takes to advance a step, and -- the one that matters most -- how long it takes from
 * pressing Enter on a command to the lesson panel showing the objective as done and the next task
 * in its place. Prints timings; see docs/testing.md.
 */
import { expect, test, type Page } from "@playwright/test";
import { waitForTerminal } from "../e2e/helpers";

const rows: string[] = [];

function record(scenario: string, size: string, ms: number) {
  const row = `| ${scenario} | ${size} | ${String(ms)} |`;
  rows.push(row);
  process.stderr.write(`${row}\n`);
}

test.afterAll(() => {
  process.stderr.write(
    ["", "| Browser scenario | Size | ms |", "| --- | --- | ---: |", ...rows, ""].join("\n"),
  );
});

/** The longest reading page in the curriculum: every content block type, including a demo. */
const CONCEPT_LESSON = "/learn/remotes/git-push";

test("a reading page becomes usable quickly", async ({ page }) => {
  const before = Date.now();
  await page.goto(CONCEPT_LESSON);
  // The last block on the page, so everything above it has rendered too.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("concept-completion")).toBeVisible();
  const elapsed = Date.now() - before;

  const sections = await page.getByTestId("in-lesson").getByRole("listitem").count();
  expect(sections).toBeGreaterThan(2);

  // Jumping to a section is an anchor, so it must not cost a navigation.
  const jumpStart = Date.now();
  await page.getByTestId("in-lesson").getByRole("link").last().click();
  await expect(page).toHaveURL(/#/);
  const jump = Date.now() - jumpStart;

  record("open a concept lesson", `${String(sections)} sections`, elapsed);
  record("jump to a section", `${String(sections)} sections`, jump);
  expect(elapsed, "open a concept lesson").toBeLessThan(10_000);
  expect(jump, "jump to a section").toBeLessThan(2_000);
});

test("a demo advances a step without a visible pause", async ({ page }) => {
  await page.goto("/learn/git-basics/staging-area");
  const demo = page.getByTestId("demo-player");
  const step = demo.getByTestId("demo-step");
  await expect(step).toHaveText("Step 1 of 5");

  // Each step re-renders the whole visual, and files re-mount so they animate into place.
  const timings: number[] = [];
  for (let i = 2; i <= 5; i += 1) {
    const before = Date.now();
    await demo.getByRole("button", { name: "Next" }).click();
    await expect(step).toHaveText(`Step ${String(i)} of 5`);
    timings.push(Date.now() - before);
  }
  const worst = Math.max(...timings);
  record("demo step → visual updated", "worst of 4 steps", worst);
  expect(worst, "demo step → visual updated").toBeLessThan(1_000);
});

async function submit(page: Page, line: string) {
  await page.getByTestId("terminal").click();
  await page.keyboard.insertText(line);
  await page.keyboard.press("Enter");
}

test("the lesson panel keeps up with commands", async ({ page }) => {
  await page.goto("/learn/demo");
  await waitForTerminal(page, false);

  const objective = page.getByTestId("objective-initialize");
  const task = page.getByTestId("current-objective");
  await expect(task).toContainText("Step 1 of 3");

  // Enter → the objective ticks over and the task card moves on to the next step.
  const before = Date.now();
  await submit(page, "git init");
  await expect(objective).toHaveAttribute("data-state", "completed");
  await expect(task).toContainText("Step 2 of 3");
  const elapsed = Date.now() - before;

  // Revealing a hint re-renders the task card with the hint ladder inside it.
  const hintStart = Date.now();
  await page.getByTestId("reveal-hint").click();
  await expect(page.getByTestId("hint").first()).toBeVisible();
  const hint = Date.now() - hintStart;

  record("command → objective completed", "3 objectives", elapsed);
  record("reveal a hint", "3 objectives", hint);
  expect(elapsed, "command → objective completed").toBeLessThan(3_000);
  expect(hint, "reveal a hint").toBeLessThan(1_000);
});
