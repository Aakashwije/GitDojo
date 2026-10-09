/**
 * The learner-facing part of a release: the `## Highlights for learners` section of the approved
 * GitHub release notes. Only this section reaches the app; the generated changelog (pull
 * requests, contributors, dependency updates) stays on GitHub.
 *
 * Plain JavaScript, so the release workflow can run it without a build. Covered by
 * release-highlights.test.ts. Authoring guide: docs/release-notes.md.
 */

export const HIGHLIGHTS_HEADING = "Highlights for learners";

export const HIGHLIGHT_LIMITS = {
  min: 1,
  max: 5,
  /** One sentence a learner can take in at a glance. */
  highlightLength: 160,
  introLength: 240,
};

export class ReleaseNotesError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super(
      `The release notes need a "## ${HIGHLIGHTS_HEADING}" section with ${HIGHLIGHT_LIMITS.min}–${HIGHLIGHT_LIMITS.max} concise bullets:\n` +
        problems.map((problem) => `  - ${problem}`).join("\n") +
        "\nEdit the release on GitHub (see docs/release-notes.md), then re-run the workflow.",
    );
    this.name = "ReleaseNotesError";
    this.problems = problems;
  }
}

const HEADING = /^#{2,3}[ \t]+Highlights for learners[ \t]*:?[ \t]*$/im;
const ANY_HEADING = /^#{1,6}[ \t]/m;
const BULLET = /^[-*+][ \t]+(.*)$/;

/** Things that belong in the technical changelog, not in front of learners. */
const INTERNAL = [
  [/(^|[\s(])#\d+\b/, "a pull request or issue number"],
  [/(^|[\s(])@[A-Za-z0-9-]+/, "an @mention"],
  [/https?:\/\/|www\./i, "a URL"],
  [/!?\[[^\]]*\]\([^)]*\)/, "a Markdown link"],
  [/<\/?[A-Za-z][^>]*>/, "HTML"],
  [/\bdependabot\b|\bbump(?:s|ed)?\s+\S+\s+from\b/i, "a dependency update"],
];

/**
 * @param {string} text
 * @param {string} label
 * @param {number} limit
 * @param {string[]} problems
 */
function check(text, label, limit, problems) {
  if (text.length > limit) {
    problems.push(`${label} is ${text.length} characters; keep it to ${limit} or fewer.`);
  }
  for (const [pattern, what] of INTERNAL) {
    if (pattern.test(text)) problems.push(`${label} contains ${what}; keep that on GitHub.`);
  }
}

/**
 * Reads the learner highlights from a release body.
 *
 * @param {string} body The release notes, as Markdown.
 * @returns {{ intro: string | null; highlights: string[] }}
 * @throws {ReleaseNotesError} When the section is missing, empty, too long or not learner-facing.
 */
export function parseLearnerHighlights(body) {
  // Authoring guidance in the template lives in comments; it is never content.
  const text = String(body ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r\n?/g, "\n");
  const heading = HEADING.exec(text);
  if (!heading) throw new ReleaseNotesError([`There is no "## ${HIGHLIGHTS_HEADING}" heading.`]);

  const start = heading.index + heading[0].length;
  const next = ANY_HEADING.exec(text.slice(start));
  const section = text.slice(start, next ? start + next.index : undefined);

  const problems = [];
  const introLines = [];
  const highlights = [];
  for (const line of section.split("\n")) {
    if (line.trim() === "") continue;
    const bullet = BULLET.exec(line);
    if (bullet) {
      const highlight = (bullet[1] ?? "").trim();
      if (highlight !== "") highlights.push(highlight);
      continue;
    }
    if (/^\s+[-*+][ \t]/.test(line)) {
      problems.push("Nested bullets are not shown; make each highlight one top-level bullet.");
    } else if (highlights.length > 0) {
      problems.push(
        `"${line.trim().slice(0, 40)}" follows the bullets; keep each highlight on one line and put the introduction above them.`,
      );
    } else {
      introLines.push(line.trim());
    }
  }

  if (highlights.length < HIGHLIGHT_LIMITS.min) {
    problems.push("There are no highlights yet: add at least one bullet.");
  }
  if (highlights.length > HIGHLIGHT_LIMITS.max) {
    problems.push(
      `There are ${highlights.length} highlights; choose the ${HIGHLIGHT_LIMITS.max} learners will notice most.`,
    );
  }
  if (new Set(highlights.map((h) => h.toLowerCase())).size !== highlights.length) {
    problems.push("Two highlights are the same.");
  }
  highlights.forEach((highlight, index) => {
    check(highlight, `Highlight ${index + 1}`, HIGHLIGHT_LIMITS.highlightLength, problems);
  });
  const intro = introLines.join(" ").trim();
  if (intro !== "") check(intro, "The introduction", HIGHLIGHT_LIMITS.introLength, problems);

  if (problems.length > 0) throw new ReleaseNotesError(problems);
  return { intro: intro === "" ? null : intro, highlights };
}
