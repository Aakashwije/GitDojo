import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import postgres from "postgres";
import { e2eDatabaseUrl, mockIdpURL } from "../playwright.config";
import { stat, waitForProgressSaved } from "./helpers";

// Account progress end to end: the real SDK sign-in against the mock identity provider, the
// progress API, and a real PostgreSQL database (E2E_DATABASE_URL). Runs in Chromium and Firefox;
// each project uses its own mock users so both can share one database.

test.skip(!e2eDatabaseUrl, "Set E2E_DATABASE_URL to a migrated test database to run these tests.");
test.describe.configure({ mode: "serial" });

const USERS: Record<string, { primary: string; secondary: string; subjects: string[] }> = {
  "account-chromium": {
    primary: "Grace Hopper",
    secondary: "Linus Torvalds",
    subjects: ["c0ffee00-0000-4000-8000-000000000002", "c0ffee00-0000-4000-8000-000000000003"],
  },
  "account-firefox": {
    primary: "Margaret Hamilton",
    secondary: "Alan Turing",
    subjects: ["c0ffee00-0000-4000-8000-000000000004", "c0ffee00-0000-4000-8000-000000000005"],
  },
};

function usersFor(info: TestInfo) {
  const users = USERS[info.project.name];
  if (!users) throw new Error(`No mock users for project ${info.project.name}`);
  return users;
}

let sql: postgres.Sql;

// eslint-disable-next-line no-empty-pattern -- Playwright requires a fixtures object here.
test.beforeAll(async ({}, info) => {
  const database = new URL(e2eDatabaseUrl).pathname.slice(1);
  if (!database.includes("test")) throw new Error("E2E_DATABASE_URL must name a test database.");
  sql = postgres(e2eDatabaseUrl, { max: 1, onnotice: () => undefined });
  // A clean slate for this project's users only.
  await sql`DELETE FROM users WHERE subject IN ${sql(usersFor(info).subjects)}`;
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

/** Lesson completions stored for a mock user, straight from PostgreSQL. */
async function stored(name: string) {
  const email = `${(name.split(" ")[0] ?? "").toLowerCase()}@example.com`;
  return sql<{ lesson_id: string; xp: number }[]>`
    SELECT c.lesson_id, c.xp FROM lesson_completions c JOIN users u ON u.id = c.user_id
    WHERE u.email = ${email} ORDER BY c.lesson_id
  `;
}

async function signIn(page: Page, name: string, returnTo = "/dashboard") {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByTestId("start-sign-in").click();
  await page.getByRole("link", { name: `Sign in as ${name}` }).click();
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace(/[/]/g, "\\/")}$`));
  await expect(page.getByRole("button", { name: `Account menu for ${name}` })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-progress-mode", "account");
}

async function signOut(page: Page, name: string) {
  await page.getByRole("button", { name: `Account menu for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/auth\/signed-out$/);
}

async function completeConcept(page: Page, lesson: string, xp = "+25 XP") {
  await page.goto(`/learn/git-basics/${lesson}`);
  await page.getByTestId("mark-complete").click();
  await expect(page.getByTestId("concept-completion")).toContainText(xp);
  await waitForProgressSaved(page);
}

/** A browser with nothing saved: no cookies, no IndexedDB. */
async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("a lesson completed while signed in is saved to the account and loads in a fresh browser", async ({
  page,
  browser,
}, info) => {
  const { primary } = usersFor(info);
  await signIn(page, primary, "/learn/git-basics/what-is-git");
  await page.getByTestId("mark-complete").click();
  await expect(page.getByTestId("concept-completion")).toContainText("+25 XP");
  await waitForProgressSaved(page);
  expect(await stored(primary)).toEqual([{ lesson_id: "what-is-git", xp: 25 }]);

  const fresh = await freshPage(browser);
  await signIn(fresh.page, primary);
  await expect(stat(fresh.page, "xp")).toHaveText("25");
  await fresh.page.goto("/learn/git-basics");
  await expect(fresh.page.getByTestId("course-percent")).toHaveText("10%");
  await fresh.context.close();
});

test("duplicate and concurrent completions award XP once", async ({ page, context }, info) => {
  const { primary } = usersFor(info);
  await signIn(page, primary);

  // Retries and races straight to the API: one record, one award.
  const statuses = await page.evaluate(() =>
    Promise.all(
      Array.from({ length: 5 }, () =>
        fetch("/api/progress/lessons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId: "staging-area" }),
        }).then((response) => response.status),
      ),
    ),
  );
  expect(statuses.filter((status) => status === 201)).toHaveLength(1);
  expect(statuses.filter((status) => status === 200)).toHaveLength(4);

  // A lesson completed through the account shows as complete, with nothing left to award.
  await page.goto("/learn/git-basics/staging-area");
  await expect(page.getByTestId("concept-completion")).toContainText("Lesson complete");
  await expect(page.getByTestId("mark-complete")).toHaveCount(0);

  // The same lesson open in two tabs: finishing it in one completes it in the other, without a
  // second award or request.
  const second = await context.newPage();
  await Promise.all([page, second].map((tab) => tab.goto("/learn/git-basics/working-tree")));
  await page.getByTestId("mark-complete").click();
  await waitForProgressSaved(page);
  await expect(second.getByTestId("concept-completion")).toContainText("Lesson complete");
  await expect(second.getByTestId("mark-complete")).toHaveCount(0);

  expect(await stored(primary)).toEqual([
    { lesson_id: "staging-area", xp: 25 },
    { lesson_id: "what-is-git", xp: 25 },
    { lesson_id: "working-tree", xp: 25 },
  ]);
  await page.goto("/dashboard");
  await expect(stat(page, "xp")).toHaveText("75");
});

test("anonymous progress and other accounts stay separate, and sign-out returns to anonymous", async ({
  browser,
}, info) => {
  const { primary, secondary } = usersFor(info);
  const { context, page } = await freshPage(browser);

  // Anonymous learning in this browser.
  await completeConcept(page, "git-vs-github");
  await page.goto("/dashboard");
  await expect(page.locator("html")).toHaveAttribute("data-progress-mode", "anonymous");
  await expect(stat(page, "xp")).toHaveText("25");

  // Another learner signs in here: only their (empty) account, nothing uploaded.
  await signIn(page, secondary);
  await expect(stat(page, "xp")).toHaveText("0");
  expect(await stored(secondary)).toEqual([]);

  // Signing out brings the anonymous progress back, untouched.
  await signOut(page, secondary);
  await page.goto("/dashboard");
  await expect(page.locator("html")).toHaveAttribute("data-progress-mode", "anonymous");
  await expect(stat(page, "xp")).toHaveText("25");

  // The first learner in the same browser sees only their own progress.
  await signIn(page, primary);
  await expect(stat(page, "xp")).toHaveText("75");
  expect(await stored(secondary)).toEqual([]);
  await context.close();
});

test("an ended session is explained, and the lesson is saved after signing in again", async ({
  page,
  request,
}, info) => {
  const { secondary } = usersFor(info);
  await signIn(page, secondary, "/learn/git-basics/what-is-git");

  // The provider ends this learner's sessions (as an expiry or revocation would).
  const user = (secondary.split(" ")[0] ?? "").toLowerCase();
  expect((await request.post(`${mockIdpURL}/test/revoke?user=${user}`)).status()).toBe(204);

  await page.getByTestId("mark-complete").click();
  await expect(page.getByTestId("concept-completion")).toContainText("+25 XP");
  const notice = page.getByTestId("progress-status");
  await expect(notice).toContainText("Your session has ended");
  expect(await stored(secondary)).toEqual([]);

  // Signing in again (from the notice) saves what was finished in the meantime.
  await notice.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByTestId("start-sign-in").click();
  await page.getByRole("link", { name: `Sign in as ${secondary}` }).click();
  await expect(page.getByRole("button", { name: `Account menu for ${secondary}` })).toBeVisible();
  await expect.poll(() => stored(secondary)).toEqual([{ lesson_id: "what-is-git", xp: 25 }]);
  await page.goto("/dashboard");
  await expect(stat(page, "xp")).toHaveText("25");
});
