import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type LessonSource } from "./loader";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Reads `<slug>.yaml` files from a directory. Node-only; used at build time and in tests. */
export function createDirectoryLessonSource(directory: string): LessonSource {
  return {
    async read(slug) {
      // Slugs come from URLs; never let one name a file outside the content directory.
      if (!SLUG_PATTERN.test(slug)) return null;
      try {
        return await readFile(join(directory, `${slug}.yaml`), "utf8");
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
        throw error;
      }
    },
    async list() {
      const names = await readdir(directory);
      return names
        .filter((name) => name.endsWith(".yaml"))
        .map((name) => name.slice(0, -".yaml".length))
        .sort();
    },
  };
}
