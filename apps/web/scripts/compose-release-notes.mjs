import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { parseLearnerHighlights } from "./release-highlights.mjs";

const [changelogPath, outputPath] = process.argv.slice(2);
const repository = process.env.GITHUB_REPOSITORY;

if (!changelogPath || !outputPath || !repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
  console.error(
    "Usage: GITHUB_REPOSITORY=owner/repo node compose-release-notes.mjs <generated-changelog> <output>",
  );
  process.exit(2);
}

const changelog = (await readFile(changelogPath, "utf8")).trim();
const pullRequestNumbers = [
  ...new Set(
    [...changelog.matchAll(/\bin\s+#(\d+)\b|\/pull\/(\d+)\b/g)].map(
      (match) => match[1] ?? match[2],
    ),
  ),
];

if (pullRequestNumbers.length === 0) {
  throw new Error("GitHub generated no pull request links; cannot collect learner release notes.");
}

const highlights = [];
const missingNotes = [];
for (const number of pullRequestNumbers) {
  const raw = execFileSync("gh", ["api", `repos/${repository}/pulls/${number}`], {
    encoding: "utf8",
  });
  const pullRequest = JSON.parse(raw);
  if (pullRequest.merged_at === null || pullRequest.base?.ref !== "main") continue;
  if (pullRequest.user?.type === "Bot") continue;

  const body = String(pullRequest.body ?? "").replace(/\r\n?/g, "\n");
  const heading = /^#{2,3}[ \t]+Learner-facing release note[ \t]*:?[ \t]*$/im.exec(body);
  if (!heading) {
    missingNotes.push(`#${number} ${pullRequest.title}`);
    continue;
  }

  const start = heading.index + heading[0].length;
  const nextHeading = /^#{1,6}[ \t]+/m.exec(body.slice(start));
  const section = body
    .slice(start, nextHeading ? start + nextHeading.index : undefined)
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();

  if (/^(?:[-*+]\s*)?(?:none|no learner-facing change)\.?$/i.test(section)) continue;

  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const bullets = lines.map((line) => /^[-*+][ \t]+(.+)$/.exec(line)?.[1]?.trim());
  if (bullets.length === 0 || bullets.some((bullet) => !bullet)) {
    missingNotes.push(
      `#${number} ${pullRequest.title} (use one plain-language bullet or “No learner-facing change.”)`,
    );
    continue;
  }
  highlights.push(...bullets);
}

if (missingNotes.length > 0) {
  throw new Error(
    `Add a “Learner-facing release note” section to these merged PRs, with one plain-language bullet or “No learner-facing change.”:\n${missingNotes.map((note) => `  - ${note}`).join("\n")}`,
  );
}

const uniqueHighlights = [...new Set(highlights)];
const finalHighlights =
  uniqueHighlights.length > 0
    ? uniqueHighlights
    : ["This release focuses on behind-the-scenes improvements to GitDojo."];

const template = await readFile(".github/release-highlights-template.md", "utf8");
if (!template.includes("{{HIGHLIGHTS}}")) {
  throw new Error("The release highlights template is missing the {{HIGHLIGHTS}} placeholder.");
}

const learnerSection = template
  .replace("{{HIGHLIGHTS}}", finalHighlights.map((item) => `- ${item}`).join("\n"))
  .trim();
const notes = `${learnerSection}\n\n${changelog}\n`;

// Keep the release draft aligned with the same checks used before production is deployed.
parseLearnerHighlights(notes);
await writeFile(outputPath, notes, "utf8");
console.log(
  `Collected ${finalHighlights.length} learner highlight(s) from ${pullRequestNumbers.length} merged PR(s).`,
);
