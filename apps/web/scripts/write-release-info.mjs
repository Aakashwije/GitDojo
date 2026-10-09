import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLearnerHighlights, ReleaseNotesError } from "./release-highlights.mjs";

/**
 * Writes lib/release-info.json for the production build: the version, its publication date and
 * the learner highlights from the approved release notes, nothing else.
 *
 * The release comes from RELEASE_JSON (`gh api repos/<repo>/releases/tags/<tag>`), so re-running
 * the workflow after editing the notes uses the edited notes; otherwise from the triggering event.
 * `--check` validates without writing, so a release without highlights stops before production.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tag = process.env.TAG;
const source = process.env.RELEASE_JSON ?? process.env.GITHUB_EVENT_PATH;
const checkOnly = process.argv.includes("--check");

if (!tag || !/^v0\.1\.\d+$/.test(tag) || !source) {
  throw new Error("TAG and RELEASE_JSON (or GITHUB_EVENT_PATH) are required.");
}

const raw = JSON.parse(await readFile(source, "utf8"));
const release = process.env.RELEASE_JSON ? raw : raw.release;
if (
  release?.tag_name !== tag ||
  !release.published_at ||
  typeof release.body !== "string" ||
  release.draft === true
) {
  throw new Error(`${source} does not contain the published release ${tag}.`);
}

let content;
try {
  content = parseLearnerHighlights(release.body);
} catch (error) {
  if (!(error instanceof ReleaseNotesError)) throw error;
  // One annotation per problem, so the run summary says exactly what to fix.
  for (const problem of error.problems) console.log(`::error title=Release ${tag}::${problem}`);
  console.error(error.message);
  process.exit(1);
}

console.log(`Learner highlights for ${tag}:`);
for (const highlight of content.highlights) console.log(`  - ${highlight}`);

if (!checkOnly) {
  const info = {
    version: tag,
    publishedAt: release.published_at,
    intro: content.intro,
    highlights: content.highlights,
  };
  await writeFile(path.join(root, "lib/release-info.json"), `${JSON.stringify(info, null, 2)}\n`);
}
