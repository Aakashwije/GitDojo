import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { run, show, solveLesson, waitForTerminal } from "./helpers";

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

/** Every scan runs in both themes; the choice is saved before the page loads, as a learner's is. */
const THEMES = ["dark", "light"] as const;

const PAGES = [
  { name: "landing", path: "/" },
  { name: "course list", path: "/learn" },
  { name: "course overview", path: "/learn/git-basics" },
  { name: "concept lesson", path: "/learn/git-basics/what-is-git" },
  { name: "challenge browser", path: "/challenges" },
  { name: "practice browser", path: "/practice" },
  { name: "dashboard", path: "/dashboard" },
  { name: "sign in", path: "/sign-in" },
  { name: "what's new", path: "/whats-new" },
];

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem("gitdojo:theme", value);
      }, theme);
    });

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

    test("lesson workspace has no detectable accessibility violations", async ({
      page,
      isMobile,
    }) => {
      await page.goto("/learn/demo");
      await waitForTerminal(page, isMobile);
      await expectNoViolations(page, THIRD_PARTY);
    });

    test("adaptive hints have no detectable accessibility violations", async ({
      page,
      isMobile,
    }) => {
      await page.goto("/learn/git-basics/git-add");
      await waitForTerminal(page, isMobile);
      await run(page, "git add index.js");
      await show(page, "Lesson", isMobile);
      const suggestion = page.getByTestId("adaptive-hint");
      await suggestion.getByRole("button", { name: "Show a hint based on your progress" }).click();
      await expect(suggestion.getByTestId("adaptive-hint-step")).toHaveCount(1);
      await expectNoViolations(page, THIRD_PARTY);
    });

    test("practice workspace has no detectable accessibility violations", async ({
      page,
      isMobile,
    }) => {
      await page.goto("/practice/tag-a-release");
      await waitForTerminal(page, isMobile);
      await show(page, "Task", isMobile);
      await page.getByTestId("practice-check").click();
      await expect(page.getByTestId("practice-feedback")).toBeVisible();
      await expectNoViolations(page, THIRD_PARTY);
    });

    test("git editor dialog keeps focus and is accessible", async ({ page, isMobile }) => {
      await page.goto("/learn/recovery/git-rebase-interactive");
      await waitForTerminal(page, isMobile);
      await run(page, "git rebase -i main");
      const dialog = page.getByTestId("git-editor");
      await expect(dialog.getByLabel("Rebase todo list")).toBeFocused();
      for (let i = 0; i < 4; i += 1) {
        await page.keyboard.press("Tab");
        expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
      }
      await expectNoViolations(page, THIRD_PARTY);
      await dialog.getByTestId("git-editor-abort").click();
      await expect(dialog).toBeHidden();
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

    test("PDF report dialog is keyboard operable and accessible", async ({ page }) => {
      await page.goto("/dashboard");
      const button = page.getByRole("button", { name: "Export PDF report" });
      await expect(button).toBeEnabled();
      await button.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Export your progress report" });
      await expect(dialog).toBeVisible();
      await expectNoViolations(page);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(button).toBeFocused();
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
  });
}

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
