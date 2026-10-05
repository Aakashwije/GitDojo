import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { stat, waitForProgressSaved, waitForTerminal } from "./helpers";

// This suite runs against a build with no identity provider configured (as CI does). Session
// states are produced by answering the session endpoint, the boundary the navigation uses.

type Session =
  | { status: "unconfigured" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: { name: string; email: string | null; picture: null } };

const ADA: Session = {
  status: "signed-in",
  user: { name: "Ada Lovelace", email: "ada@example.com", picture: null },
};

async function answerSession(page: Page, session: Session) {
  await page.unroute("**/api/auth/session");
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: session }));
}

const PUBLIC_ROUTES = [
  "/",
  "/learn",
  "/learn/git-basics",
  "/learn/git-basics/what-is-git",
  "/learn/demo",
  "/challenges",
  "/challenges/detached-head",
  "/playground",
  "/dashboard",
];

test.describe("without accounts configured", () => {
  for (const path of PUBLIC_ROUTES) {
    test(`${path} stays public`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(path === "/" ? "/$" : `${path}$`));
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeAttached();
    });
  }

  test("the session endpoint says accounts are unavailable, and is never cached", async ({
    request,
  }) => {
    const response = await request.get("/api/auth/session");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toEqual({ status: "unconfigured" });
  });

  test("headers show no account controls", async ({ page }) => {
    await page.goto("/learn");
    await expect(page.getByTestId("account-loading")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  });

  test("sign-in explains that accounts are unavailable and keeps learning one click away", async ({
    page,
  }) => {
    await page.goto("/sign-in?returnTo=%2Flearn%2Fmerging");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome back");
    await expect(page.getByTestId("auth-unavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
    await page.getByRole("link", { name: "Continue learning" }).click();
    await expect(page).toHaveURL(/\/learn\/merging$/);
  });

  test("sign-up explains the same", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Start your Git journey");
    await expect(page.getByTestId("auth-unavailable")).toBeVisible();
  });

  test("account routes fall back safely instead of breaking", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/auth/callback?code=abc&state=xyz");
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/auth/sign-out");
    await expect(page).toHaveURL(/\/$/);
  });

  test("an external return URL is never followed", async ({ page }) => {
    await page.goto("/sign-in?returnTo=https%3A%2F%2Fevil.example%2F");
    await expect(page.getByRole("link", { name: "Continue learning" })).toHaveAttribute(
      "href",
      "/learn",
    );
  });
});

test.describe("navigation reflects the session", () => {
  test("signed out: sign in and create account, returning to the current page", async ({
    page,
    isMobile,
  }) => {
    await answerSession(page, { status: "signed-out" });
    await page.goto("/challenges");
    const signIn = page.getByRole("banner").getByRole("link", { name: "Sign in" });
    await expect(signIn).toHaveAttribute("href", "/sign-in?returnTo=%2Fchallenges");
    const create = page.getByRole("banner").getByRole("link", { name: "Create account" });
    if (isMobile) await expect(create).toBeHidden();
    else await expect(create).toHaveAttribute("href", "/sign-up?returnTo=%2Fchallenges");

    // The same control in a lesson workspace and the playground.
    await page.goto("/learn/demo");
    await waitForTerminal(page, isMobile);
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?returnTo=%2Flearn%2Fdemo",
    );
    await page.goto("/playground");
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("signed in: the account menu works with the keyboard", async ({ page }) => {
    // Scanned at rest rather than mid-animation.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await answerSession(page, ADA);
    await page.goto("/dashboard");
    const trigger = page.getByRole("button", { name: "Account menu for Ada Lovelace" });
    await expect(trigger).toBeVisible();
    await expect(page.getByTestId("account-avatar").first()).toHaveText("AL");

    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("ada@example.com");
    // Opening with the keyboard focuses the first item; arrows move between items.
    await expect(menu.getByRole("menuitem", { name: "Account" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Dashboard" })).toBeFocused();

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(violations.map((violation) => violation.id)).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("a session that ended on its own is reported once", async ({ page }) => {
    await answerSession(page, ADA);
    await page.goto("/learn");
    await expect(page.getByRole("button", { name: /Account menu/ })).toBeVisible();

    await answerSession(page, { status: "signed-out" });
    await page.reload();
    const notice = page.getByTestId("session-expired");
    await expect(notice).toContainText("Your session has ended");
    await notice.getByRole("button", { name: "Dismiss" }).click();
    await expect(notice).toBeHidden();
    await page.reload();
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByTestId("session-expired")).toHaveCount(0);
  });

  test("signed in shows the account's progress; anonymous progress is kept for later", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/learn/git-basics/what-is-git");
    await page.getByTestId("mark-complete").click();
    await expect(page.getByTestId("concept-completion")).toContainText("+25 XP");
    await waitForProgressSaved(page);

    // Signed in: the (empty) account is shown, never the anonymous progress.
    await answerSession(page, ADA);
    await page.route("**/api/progress", (route) =>
      route.fulfill({
        json: { account: { id: "e2e-account" }, completedLessons: [], totalXp: 0 },
        headers: { "Cache-Control": "private, no-store" },
      }),
    );
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: /Account menu/ })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-progress-mode", "account");
    await expect(stat(page, "xp")).toHaveText("0");
    await page.unroute("**/api/progress");

    // Sign out from the menu (this build has no provider, so the sign-out page sends us home).
    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);

    await answerSession(page, { status: "signed-out" });
    await page.goto("/dashboard");
    await expect(stat(page, "xp")).toHaveText("25");
    await expect(page.getByTestId("session-expired")).toHaveCount(0);
    await page.goto("/learn/git-basics");
    await expect(page.getByTestId("course-percent")).toHaveText("10%");
    if (!isMobile) {
      await expect(
        page.getByRole("banner").getByRole("link", { name: "Create account" }),
      ).toBeVisible();
    }
  });
});

test.describe("accessibility", () => {
  test.use({ reducedMotion: "reduce" });

  for (const path of ["/sign-in", "/sign-up"]) {
    test(`${path} has no detectable accessibility violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(violations.map((violation) => violation.id)).toEqual([]);
    });
  }

  test("sign-in links are reachable by keyboard", async ({ page }) => {
    await page.goto("/sign-in");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "GitDojo home" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Continue learning" })).toBeFocused();
  });
});
