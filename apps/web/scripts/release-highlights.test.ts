import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parseLearnerHighlights, ReleaseNotesError } from "./release-highlights.mjs";

/** What `gh release create --generate-notes` writes, below the template's section. */
const CHANGELOG = `## What's Changed
* feat: lesson hints by @aakash in https://github.com/Aakashwije/GitDojo/pull/41
* chore(deps-dev): bump typescript from 5.9.3 to 6.0.3 by @dependabot in https://github.com/Aakashwije/GitDojo/pull/42

**Full Changelog**: https://github.com/Aakashwije/GitDojo/compare/v0.1.11...v0.1.12`;

const notes = (section: string) => `## Highlights for learners

<!-- Write 1–5 bullets. See docs/release-notes.md. -->
${section}

${CHANGELOG}`;

function problems(body: string): string[] {
  try {
    parseLearnerHighlights(body);
  } catch (error) {
    if (error instanceof ReleaseNotesError) return error.problems;
    throw error;
  }
  return [];
}

describe("learner highlights", () => {
  it("reads the intro and bullets, and nothing from the generated changelog", () => {
    expect(
      parseLearnerHighlights(
        notes(`This release is about getting unstuck.

- Reveal a hint when an objective has you stuck.
* See merges more clearly in the Git graph.`),
      ),
    ).toEqual({
      intro: "This release is about getting unstuck.",
      highlights: [
        "Reveal a hint when an objective has you stuck.",
        "See merges more clearly in the Git graph.",
      ],
    });
  });

  it("works with the section anywhere in the notes and without an intro", () => {
    const body = `${CHANGELOG}\n\n### Highlights for learners\n\n- Practise \`git restore\` in a new lesson.\n`;
    expect(parseLearnerHighlights(body)).toEqual({
      intro: null,
      highlights: ["Practise `git restore` in a new lesson."],
    });
  });

  it("ignores the template's guidance comments, even when they contain bullets", () => {
    const body = notes(`<!--
- Example: Undo a commit safely with git revert.
-->`);
    expect(problems(body)).toEqual(["There are no highlights yet: add at least one bullet."]);
  });

  it("stops a release without the section, with a message saying what to do", () => {
    expect(() => parseLearnerHighlights(CHANGELOG)).toThrow(/## Highlights for learners/);
    expect(() => parseLearnerHighlights(CHANGELOG)).toThrow(/docs\/release-notes\.md/);
  });

  it("allows one to five highlights", () => {
    const bullets = (n: number) =>
      Array.from({ length: n }, (_, i) => `- Learners notice change ${String(i + 1)}.`).join("\n");
    expect(parseLearnerHighlights(notes(bullets(5))).highlights).toHaveLength(5);
    expect(problems(notes(bullets(6)))).toEqual([
      "There are 6 highlights; choose the 5 learners will notice most.",
    ]);
  });

  it("keeps highlights concise and learner-facing", () => {
    const found = problems(
      notes(`- ${"A very long highlight. ".repeat(10)}
- Faster graph (#41)
- Thanks @aakash for the new lesson
- Read more at https://example.com
- See [the docs](https://example.com)
- Bump typescript from 5.9.3 to 6.0.3
- Faster graph (#41)`),
    );
    expect(found).toEqual(
      expect.arrayContaining([
        "Two highlights are the same.",
        expect.stringMatching(/^Highlight 1 is \d+ characters; keep it to 160 or fewer\.$/),
        "Highlight 2 contains a pull request or issue number; keep that on GitHub.",
        "Highlight 3 contains an @mention; keep that on GitHub.",
        "Highlight 4 contains a URL; keep that on GitHub.",
        "Highlight 5 contains a Markdown link; keep that on GitHub.",
        "Highlight 6 contains a dependency update; keep that on GitHub.",
        "There are 7 highlights; choose the 5 learners will notice most.",
      ]),
    );
  });

  it("refuses nested bullets and text after the list rather than dropping it", () => {
    expect(problems(notes("- One thing.\n  - A detail.\nAnd another sentence."))).toEqual([
      "Nested bullets are not shown; make each highlight one top-level bullet.",
      '"And another sentence." follows the bullets; keep each highlight on one line and put the introduction above them.',
    ]);
  });
});

const run = promisify(execFile);
const SCRIPT = path.join(import.meta.dirname, "write-release-info.mjs");

async function writeReleaseInfo(release: object, args: string[] = []) {
  const dir = await mkdtemp(path.join(tmpdir(), "gitdojo-release-"));
  const file = path.join(dir, "release.json");
  await writeFile(file, JSON.stringify(release));
  return run(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, TAG: "v0.1.12", RELEASE_JSON: file },
  });
}

describe("write-release-info --check", () => {
  const release = {
    tag_name: "v0.1.12",
    draft: false,
    published_at: "2026-10-09T09:30:00Z",
    body: notes("- Reveal a hint when an objective has you stuck."),
  };

  it("passes approved notes without touching the app", async () => {
    const before = await readFile(
      path.join(import.meta.dirname, "../lib/release-info.json"),
      "utf8",
    );
    const { stdout } = await writeReleaseInfo(release, ["--check"]);
    expect(stdout).toContain("- Reveal a hint when an objective has you stuck.");
    expect(await readFile(path.join(import.meta.dirname, "../lib/release-info.json"), "utf8")).toBe(
      before,
    );
  });

  it("fails with a GitHub annotation per problem when highlights are missing", async () => {
    const failure = (await writeReleaseInfo({ ...release, body: CHANGELOG }, ["--check"]).then(
      () => null,
      (error: unknown) => error,
    )) as { code: number; stdout: string } | null;
    expect(failure?.code).toBe(1);
    expect(failure?.stdout).toContain(
      '::error title=Release v0.1.12::There is no "## Highlights for learners" heading.',
    );
  });

  it("refuses a draft", async () => {
    await expect(writeReleaseInfo({ ...release, draft: true }, ["--check"])).rejects.toThrow(
      /does not contain the published release v0\.1\.12/,
    );
  });
});
