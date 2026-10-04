// Copies Monaco's prebuilt AMD bundle into public/ so the editor is served from GitDojo itself,
// never from a third-party CDN. Runs before `next dev` and `next build`; skipped when up to date.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
// monaco-editor's `exports` map hides package.json, so resolve the installed directory directly.
const packageDir = join(appDir, "node_modules", "monaco-editor");
const { version } = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"));

const target = join(appDir, "public", "monaco");
const stamp = join(target, "VERSION");

const current = await readFile(stamp, "utf8").catch(() => null);
if (current === version) process.exit(0);

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(join(packageDir, "min", "vs"), join(target, "vs"), { recursive: true });
await writeFile(stamp, version);
console.log(`[gitdojo] copied monaco-editor ${version} to public/monaco`);
