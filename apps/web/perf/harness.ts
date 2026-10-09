/**
 * Shared harness for the stress scenarios (`pnpm perf`). Every scenario is timed, checked against
 * a budget, and collected into a Markdown table ready for docs/testing.md.
 *
 * Timings vary by machine, so each budget is roughly 10-30x a laptop's time (see docs/testing.md):
 * it catches a regression of an order of magnitude, not normal noise.
 */
import { afterAll, expect } from "vitest";

/** Upper limits in milliseconds, keyed by scenario. Documented in docs/testing.md. */
export const BUDGETS_MS: Readonly<Record<string, number>> = {
  // Repository and engine hot paths (scenarios.perf.ts).
  "create commits (git add + commit)": 30_000,
  "read repository state": 3_000,
  "git log --oneline": 2_000,
  "git log --all --oneline": 3_000,
  "build commit graph (React Flow nodes)": 500,
  "git reflog": 500,
  "git status (all untracked)": 1_000,
  "git add .": 5_000,
  "git commit": 1_000,
  "git status (50 modified)": 1_000,
  "git diff": 1_000,
  "assign lanes": 500,
  "parse + validate lesson YAML": 1_000,
  "queue edit + add + commit rounds": 30_000,
  "type with autosave, then flush": 2_000,
  "sequential updates (each awaited)": 1_000,
  "burst of updates (batched)": 500,
  // Lesson UI rendering (lesson-ui.perf.tsx).
  "lesson outline from content blocks": 500,
  "render lesson content": 5_000,
  "render objectives": 500,
  "advance every objective in turn": 5_000,
  "step through a demo": 15_000,
};

const results: { scenario: string; size: string; ms: number; note?: string }[] = [];

export async function measure<T>(
  scenario: string,
  size: string,
  task: () => Promise<T> | T,
  note?: string,
): Promise<T> {
  const start = performance.now();
  const value = await task();
  const ms = Math.round((performance.now() - start) * 10) / 10;
  results.push({ scenario, size, ms, ...(note ? { note } : {}) });
  const budget = BUDGETS_MS[scenario];
  if (budget === undefined) throw new Error(`No budget for scenario "${scenario}"`);
  expect(
    ms,
    `${scenario} (${size}) took ${String(ms)} ms; budget ${String(budget)} ms`,
  ).toBeLessThan(budget);
  return value;
}

afterAll(() => {
  if (results.length === 0) return;
  // A Markdown table, ready for docs/testing.md. stderr, because Vitest hides passing tests' logs.
  const rows = results.map(
    (row) =>
      `| ${row.scenario} | ${row.size} | ${String(row.ms)} |${row.note ? ` ${row.note} |` : ""}`,
  );
  process.stderr.write(
    ["", "| Scenario | Size | ms |", "| --- | --- | ---: |", ...rows, ""].join("\n"),
  );
});
