import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tag = process.env.TAG;
const eventPath = process.env.GITHUB_EVENT_PATH;

if (!tag || !/^v0\.1\.\d+$/.test(tag) || !eventPath) {
  throw new Error("TAG and GITHUB_EVENT_PATH are required to write release information.");
}

const event = JSON.parse(await readFile(eventPath, "utf8"));
const release = event.release;
if (
  release?.tag_name !== tag ||
  !release.published_at ||
  !release.html_url ||
  typeof release.body !== "string" ||
  release.draft === true
) {
  throw new Error(`GitHub event does not contain a published release for ${tag}.`);
}

const info = {
  version: tag,
  publishedAt: release.published_at,
  url: release.html_url,
  notes: release.body.trim(),
};

await writeFile(path.join(root, "lib/release-info.json"), `${JSON.stringify(info, null, 2)}\n`);
