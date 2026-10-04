import { expect, test, type Page } from "@playwright/test";
import { stat, waitForProgressSaved } from "./helpers";

// The real SDK flow against the local mock identity provider (e2e/mock-idp): GitDojo's pages,
// the SDK's redirect and code exchange, the signed session cookie, userinfo and sign-out.
// Credentials are never entered on a GitDojo page; the provider's page is the mock's.

const PROVIDER = /^http:\/\/localhost:\d+\/t\/gitdojo\/oauth2\/authorize/;

async function accountMenu(page: Page) {
  const trigger = page.getByRole("button", { name: "Account menu for Ada Lovelace" });
  await expect(trigger).toBeVisible();
  return trigger;
}

test("sign up from a lesson, come back to it, stay signed in, then sign out", async ({ page }) => {
  // 1. Learn anonymously: progress is local.
  await page.goto("/learn/git-basics/what-is-git");
  await page.getByTestId("mark-complete").click();
  await expect(page.getByTestId("concept-completion")).toContainText("+25 XP");
  await waitForProgressSaved(page);

  // 2. Create an account from the header; the hosted page takes over.
  await page.goto("/learn/git-basics");
  await page.getByRole("banner").getByRole("link", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/sign-up\?returnTo=%2Flearn%2Fgit-basics$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Start your Git journey");
  await page.getByTestId("start-sign-up").click();
  await expect(page).toHaveURL(PROVIDER);
  // Identity scopes only.
  await expect(page.getByTestId("scopes")).toHaveText("openid profile email");
  await page.getByRole("link", { name: "Register" }).click();

  // 3. Back on GitDojo, on the page the learner started from, signed in.
  await expect(page).toHaveURL(/\/learn\/git-basics$/);
  await accountMenu(page);

  // 4. A reload keeps the session (it lives in a signed, httpOnly cookie).
  await page.reload();
  await accountMenu(page);
  // Session cookies are httpOnly, and nothing readable by scripts holds a token.
  const cookies = await page.context().cookies();
  const sessions = cookies.filter((cookie) => cookie.name.includes("session"));
  expect(sessions.length).toBeGreaterThan(0);
  for (const cookie of sessions) expect(cookie.httpOnly).toBe(true);
  for (const cookie of cookies.filter((c) => !c.httpOnly)) {
    expect(cookie.value).not.toMatch(/^eyJ/);
  }

  // The account page is validated on the server.
  await page.goto("/account");
  await expect(page.getByTestId("account-profile")).toContainText("Ada Lovelace");
  await expect(page.getByTestId("account-profile")).toContainText("ada@example.com");

  // Local progress is untouched by signing in.
  await page.goto("/dashboard");
  await expect(stat(page, "xp")).toHaveText("25");

  // 5. Sign out from the account menu: through the provider and back.
  await (await accountMenu(page)).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/auth\/signed-out$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You're signed out");

  // 6. Anonymous learning and local progress still work.
  await page.goto("/dashboard");
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByTestId("session-expired")).toHaveCount(0);
  await expect(stat(page, "xp")).toHaveText("25");
  await page.goto("/learn/git-basics");
  await expect(page.getByTestId("course-percent")).toHaveText("10%");
});

test("cancelling on the provider's page returns to sign-in with a clear message", async ({
  page,
}) => {
  await page.goto("/sign-in?returnTo=%2Fchallenges");
  await page.getByTestId("start-sign-in").click();
  await expect(page).toHaveURL(PROVIDER);
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/sign-in\?status=cancelled&returnTo=%2Fchallenges$/);
  await expect(page.getByTestId("auth-notice")).toContainText("Sign-in was cancelled");
  // The provider's error text is never shown.
  await expect(page.locator("body")).not.toContainText("User denied the consent");
  await expect(
    page.getByRole("link", { name: "Continue learning without an account" }),
  ).toHaveAttribute("href", "/challenges");
});

test("account pages need a session; signing in returns to them", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Faccount$/);
  await page.getByTestId("start-sign-in").click();
  await page.getByRole("link", { name: "Sign in as Ada Lovelace" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId("account-profile")).toContainText("Ada Lovelace");

  // Signed in, the sign-in page just sends you on.
  await page.goto("/sign-in?returnTo=%2Fdashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a forged session cookie is rejected and reported as an ended session", async ({
  page,
  context,
}) => {
  await page.goto("/sign-in?returnTo=%2Flearn");
  await page.getByTestId("start-sign-in").click();
  await page.getByRole("link", { name: "Sign in as Ada Lovelace" }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await accountMenu(page);

  // Replace the session with a tampered one (as if it expired or was altered).
  const session = (await context.cookies()).find((cookie) =>
    cookie.name.toLowerCase().includes("session"),
  );
  expect(session).toBeDefined();
  if (!session) return;
  await context.addCookies([{ ...session, value: `${session.value.slice(0, -4)}AAAA` }]);

  await page.reload();
  await expect(page.getByTestId("session-expired")).toContainText("Your session has ended");
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Faccount$/);
});

test("the sign-in button cannot be pressed twice", async ({ page }) => {
  await page.goto("/sign-in");
  const button = page.getByTestId("start-sign-in");
  await button.dblclick();
  await expect(page).toHaveURL(PROVIDER);
});
