import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { solveLesson, waitForTerminal } from "./helpers";

// Scans run with reduced motion, so text is measured at rest rather than mid-animation (and the
// reduced-motion path gets exercised).
test.use({ reducedMotion: "reduce" });

/** WCAG 2.1 A and AA rules, including colour contrast. */
async function expectNoViolations(page: Page, exclude: string[] = []) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  for (const selector of exclude) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  const summary = violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    targets: violation.nodes.slice(0, 5).map((node) => node.target.join(" ")),
  }));
  expect(summary).toEqual([]);
}

const PAGES = [
  { name: "landing", path: "/" },
  { name: "course list", path: "/learn" },
  { name: "course overview", path: "/learn/git-basics" },
  { name: "concept lesson", path: "/learn/git-basics/what-is-git" },
  { name: "challenge browser", path: "/challenges" },
  { name: "dashboard", path: "/dashboard" },
];

for (const { name, path } of PAGES) {
  test(`${name} has no detectable accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expectNoViolations(page);
  });
}

// xterm.js renders its own (hidden) accessibility tree, and Monaco is a third-party widget; both
// are excluded so the scan covers GitDojo's own UI around them.
const THIRD_PARTY = [".xterm", ".monaco-editor"];

test("lesson workspace has no detectable accessibility violations", async ({ page, isMobile }) => {
  await page.goto("/learn/demo");
  await waitForTerminal(page, isMobile);
  await expectNoViolations(page, THIRD_PARTY);
});

test("playground has no detectable accessibility violations", async ({ page, isMobile }) => {
  await page.goto("/playground");
  await waitForTerminal(page, isMobile);
  await expectNoViolations(page, THIRD_PARTY);
});

test("completion dialog traps focus and is accessible", async ({ page, isMobile }) => {
  await page.goto("/learn/demo");
  await solveLesson(
    page,
    ["git init", "git add README.md", 'git commit -m "Initial commit"'],
    isMobile,
  );
  const dialog = page.getByRole("dialog");
  // Focus is inside the dialog, and Tab keeps it there.
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await expectNoViolations(page, THIRD_PARTY);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("dashboard reset dialog is keyboard operable", async ({ page }) => {
  await page.goto("/dashboard");
  const reset = page.getByTestId("reset-progress");
  await reset.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Reset learning progress?" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await expectNoViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // Focus returns to the button that opened it.
  await expect(reset).toBeFocused();
});

test("the main navigation is reachable on every screen size", async ({ page, isMobile }) => {
  await page.goto("/learn");
  if (isMobile) {
    const menu = page.getByRole("button", { name: "Open menu" });
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expectNoViolations(page);
  }
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Dashboard" })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dashboard");
});
