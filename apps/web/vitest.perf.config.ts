import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Stress scenarios (`pnpm perf`), kept out of the regular test run. See docs/testing.md. */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    setupFiles: ["fake-indexeddb/auto"],
    include: ["perf/**/*.perf.ts"],
    // One scenario at a time, so timings are not skewed by each other.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
