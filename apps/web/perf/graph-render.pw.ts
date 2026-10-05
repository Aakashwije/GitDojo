/**
 * The whole pipeline in a real browser: a command typed into the terminal, through the Git engine
 * and state reader, to the commit graph re-rendered with React Flow. Prints timings; see
 * docs/testing.md.
 */
import { expect, test, type Page } from "@playwright/test";
import { waitForTerminal } from "../e2e/helpers";

async function submit(page: Page, line: string) {
  await page.keyboard.insertText(line);
  await page.keyboard.press("Enter");
}

test("commit graph keeps up with a long history", async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto("/playground");
  await waitForTerminal(page, false);
  await page.getByTestId("terminal").click();
  const nodes = page.getByTestId("commit-graph").getByTestId("commit-node");
  const start = await nodes.count();

  const rows: string[] = [];
  for (const target of [50, 100, 150]) {
    // Each revert adds a commit without editing files.
    const have = await nodes.count();
    for (let i = have; i < target - 1; i += 1) await submit(page, "git revert HEAD");
    await expect(nodes).toHaveCount(target - 1, { timeout: 300_000 });

    // Time one more command until its commit is drawn.
    const before = Date.now();
    await submit(page, "git revert HEAD");
    await expect(nodes).toHaveCount(target, { timeout: 60_000 });
    const elapsed = Date.now() - before;

    // Selecting a commit re-renders the graph without running Git.
    const selectStart = Date.now();
    // Dispatched directly: in a tall, zoomed-out graph most nodes are outside the viewport.
    await nodes.first().dispatchEvent("click");
    await expect(page.getByTestId("commit-details")).toBeVisible();
    const selectElapsed = Date.now() - selectStart;
    await page.getByTestId("terminal").click();

    // Budgets (docs/testing.md): roughly 20x a laptop's time, to catch large regressions only.
    expect(elapsed, "command → graph updated").toBeLessThan(2_000);
    expect(selectElapsed, "select a commit").toBeLessThan(1_000);
    const measured = [
      `| command → graph updated | ${String(target)} commits | ${String(elapsed)} |`,
      `| select a commit | ${String(target)} commits | ${String(selectElapsed)} |`,
    ];
    rows.push(...measured);
    process.stderr.write(`${measured.join("\n")}\n`);
  }
  expect(start).toBeGreaterThan(0);
  process.stderr.write(
    ["", "| Browser scenario | Size | ms |", "| --- | --- | ---: |", ...rows, ""].join("\n"),
  );
});
