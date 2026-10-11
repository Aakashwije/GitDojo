import { expect, test, type Page } from "@playwright/test";
import { waitForTerminal } from "./helpers";

const KEY = "gitdojo:theme";

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const pageBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeColor = (page: Page) => page.locator('meta[name="theme-color"]').getAttribute("content");

// --bg-app in each theme.
const DARK_BG = "rgb(11, 13, 16)";
const LIGHT_BG = "rgb(244, 246, 249)";

test("dark is the default, and the header toggle says so", async ({ page }) => {
  await page.goto("/learn");
  expect(await theme(page)).toBe("dark");
  expect(await pageBackground(page)).toBe(DARK_BG);
  await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("switching to light applies everywhere and survives a reload and navigation", async ({
  page,
}) => {
  await page.goto("/learn");
  const toggle = page.getByRole("button", { name: "Dark theme" });
  await toggle.focus();
  await page.keyboard.press("Enter");

  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(await theme(page)).toBe("light");
  expect(await pageBackground(page)).toBe(LIGHT_BG);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
    "light",
  );
  expect(await themeColor(page)).toBe("#f4f6f9");

  await page.reload();
  expect(await theme(page)).toBe("light");
  await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.goto("/challenges");
  expect(await pageBackground(page)).toBe(LIGHT_BG);
});

test("the saved theme is applied before any JavaScript runs, so there is no flash", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "light");
  }, KEY);
  // Without the app's JavaScript nothing can hydrate: only the inline pre-paint script runs.
  // (Stylesheets still load, as they would before a real first paint.)
  await page.route("**/_next/static/chunks/**/*.js", (route) => route.abort());
  await page.goto("/learn", { waitUntil: "domcontentloaded" });
  expect(await theme(page)).toBe("light");
  expect(await pageBackground(page)).toBe(LIGHT_BG);
  expect(await themeColor(page)).toBe("#f4f6f9");
});

test("another open tab follows a theme change", async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto("/learn");
  await second.goto("/dashboard");
  await first.getByRole("button", { name: "Dark theme" }).click();
  await expect.poll(() => theme(second)).toBe("light");
  await expect(second.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("the toggle is reachable and labelled at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/learn");
  const toggle = page.getByRole("button", { name: "Dark theme" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  expect(await theme(page)).toBe("light");
});

for (const [name, path] of [
  ["lesson workspace", "/learn/demo"],
  ["playground", "/playground"],
] as const) {
  test(`the ${name} has the toggle, and its terminal follows the theme`, async ({
    page,
    isMobile,
  }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, "light");
    }, KEY);
    await page.goto(path);
    await waitForTerminal(page, isMobile);
    const terminalBackground = () =>
      page.evaluate(() => {
        // The element xterm 6 paints the theme background on.
        const surface = document.querySelector(".xterm-scrollable-element");
        return surface ? getComputedStyle(surface).backgroundColor : null;
      });
    // --bg-terminal in light, then in dark after switching from the workspace's own toolbar.
    await expect.poll(terminalBackground).toBe("rgb(251, 252, 253)");
    const toggle = page.getByRole("button", { name: "Dark theme" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect.poll(terminalBackground).toBe("rgb(8, 10, 13)");
    expect(await theme(page)).toBe("dark");
  });
}
