import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Stress scenarios (`pnpm perf`), kept out of the regular test run. See docs/testing.md. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    // Engine scenarios run in Node; the lesson UI ones opt into jsdom per file.
    environment: "node",
    setupFiles: ["fake-indexeddb/auto"],
    include: ["perf/**/*.perf.{ts,tsx}"],
    // One scenario at a time, so timings are not skewed by each other.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
