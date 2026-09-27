import { hasErrorCode } from "./fs-errors";
import { type GitDojoFs } from "./types";

type Promises = GitDojoFs["promises"];

export async function pathExists(fs: Promises, absolutePath: string): Promise<boolean> {
  try {
    await fs.stat(absolutePath);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return false;
    throw error;
  }
}

/** `mkdir -p` for absolute paths. */
export async function ensureDirectory(fs: Promises, absolutePath: string): Promise<void> {
  const segments = absolutePath.split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current = `${current}/${segment}`;
    try {
      await fs.mkdir(current);
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST")) throw error;
    }
  }
}

/** Deletes a directory's contents recursively, keeping the directory itself. */
export async function emptyDirectory(fs: Promises, absolutePath: string): Promise<void> {
  for (const name of await fs.readdir(absolutePath)) {
    const child = `${absolutePath}/${name}`;
    const stats = await fs.lstat(child);
    if (stats.isDirectory()) {
      await emptyDirectory(fs, child);
      await fs.rmdir(child);
    } else {
      await fs.unlink(child);
    }
  }
}
