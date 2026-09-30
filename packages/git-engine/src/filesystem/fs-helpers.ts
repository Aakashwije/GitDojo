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

/**
 * Writes a file so that Git always notices the change. isomorphic-git detects edits by comparing
 * file stats at one-second resolution, so a same-size rewrite within the same second looks
 * unchanged ("racy Git") unless the inode changes. LightningFS keeps the inode when overwriting,
 * and hands out `highest inode + 1` for new files, so simply deleting and recreating can reuse
 * the old number. Writing a temporary file while the old one still exists guarantees a higher,
 * unused inode; renaming it into place keeps that inode.
 */
export async function replaceFile(
  fs: Promises,
  absolutePath: string,
  content: string | Uint8Array,
): Promise<void> {
  if (!(await pathExists(fs, absolutePath))) {
    await fs.writeFile(absolutePath, content, typeof content === "string" ? "utf8" : undefined);
    return;
  }
  const slash = absolutePath.lastIndexOf("/");
  const temporary = `${absolutePath.slice(0, slash)}/.gitdojo-write-${absolutePath.slice(slash + 1)}`;
  await fs.writeFile(temporary, content, typeof content === "string" ? "utf8" : undefined);
  await fs.unlink(absolutePath);
  await fs.rename(temporary, absolutePath);
}
