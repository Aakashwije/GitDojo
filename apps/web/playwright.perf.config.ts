import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/** Browser stress scenarios (`pnpm perf:browser`), kept out of the regular e2e run. */
export default defineConfig({
  ...base,
  testDir: "./perf",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
