import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://localhost:${String(PORT)}`;

// A second server from the same build, with accounts configured against a local mock identity
// provider (e2e/mock-idp), so the real SDK sign-in flow runs without a WSO2 tenant.
const AUTH_PORT = PORT + 1;
const MOCK_IDP_PORT = PORT + 99;
export const authBaseURL = `http://localhost:${String(AUTH_PORT)}`;
export const mockIdpURL = `http://localhost:${String(MOCK_IDP_PORT)}`;

/**
 * A dedicated, disposable PostgreSQL database for account progress tests (its name must contain
 * "test"; migrate it first). Without one, the account server runs without a database and the
 * account projects skip. Set to "" so a developer's .env.local DATABASE_URL is never used.
 */
export const e2eDatabaseUrl = process.env.E2E_DATABASE_URL?.trim() ?? "";

const ACCOUNT_SPECS = ["auth-flow.spec.ts", "account-progress.spec.ts"];

/** The production server most tests run against (no accounts configured, as in CI). */
export const appServer = {
  command: `pnpm exec next start --port ${String(PORT)}`,
  url: baseURL,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: ACCOUNT_SPECS },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: ACCOUNT_SPECS },
    {
      name: "auth-flow",
      testMatch: "auth-flow.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: authBaseURL },
    },
    // Account progress with real PostgreSQL, in two browser engines. Each project signs in as
    // its own mock users, so they can run side by side against one database.
    {
      name: "account-chromium",
      testMatch: "account-progress.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: authBaseURL },
    },
    {
      name: "account-firefox",
      testMatch: "account-progress.spec.ts",
      use: { ...devices["Desktop Firefox"], baseURL: authBaseURL },
    },
  ],
  // Runs against the production build (`pnpm build` runs first via Turborepo).
  webServer: [
    appServer,
    {
      command: "node e2e/mock-idp/server.mjs",
      url: `http://localhost:${String(MOCK_IDP_PORT)}/health`,
      env: { MOCK_IDP_PORT: String(MOCK_IDP_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `pnpm exec next start --port ${String(AUTH_PORT)}`,
      url: authBaseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Test-only values for the mock provider; nothing here is a real credential.
      env: {
        NEXT_PUBLIC_ASGARDEO_BASE_URL: `http://localhost:${String(MOCK_IDP_PORT)}/t/gitdojo`,
        NEXT_PUBLIC_ASGARDEO_CLIENT_ID: "gitdojo-e2e-client",
        ASGARDEO_CLIENT_SECRET: "gitdojo-e2e-secret",
        ASGARDEO_SECRET: "e2e-session-signing-secret-not-for-production-use",
        DATABASE_URL: e2eDatabaseUrl,
      },
    },
  ],
});
