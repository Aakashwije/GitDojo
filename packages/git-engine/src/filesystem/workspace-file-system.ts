import { hasErrorCode } from "./fs-errors";
import { emptyDirectory, ensureDirectory, pathExists } from "./fs-helpers";
import {
  isGitInternalPath,
  normalizeWorkspacePath,
  parentPath,
  resolveWorkspacePath,
  UnsafePathError,
  workspaceRoot,
} from "./paths";
import { type GitDojoFs, type VirtualFileEntry, type VirtualFileSystem } from "./types";

export class FileNotFoundError extends Error {
  constructor(readonly path: string) {
    super(`File not found: ${path}`);
    this.name = "FileNotFoundError";
  }
}

/** {@link VirtualFileSystem} implementation over a shared LightningFS instance. */
export class WorkspaceFileSystem implements VirtualFileSystem {
  private readonly fs: GitDojoFs["promises"];

  constructor(fs: GitDojoFs) {
    this.fs = fs.promises;
  }

  async createWorkspace(workspaceId: string): Promise<void> {
    await ensureDirectory(this.fs, workspaceRoot(workspaceId));
  }

  async writeFile(workspaceId: string, path: string, content: string): Promise<void> {
    const normalized = this.mutablePath(path);
    await ensureDirectory(this.fs, resolveWorkspacePath(workspaceId, parentPath(normalized)));
    const absolutePath = resolveWorkspacePath(workspaceId, normalized);
    // isomorphic-git detects changes by comparing stats at one-second granularity, so a same-size
    // rewrite within the same second would look unchanged ("racy Git"). LightningFS keeps the inode
    // on overwrite; replacing the file assigns a new inode, which Git's stat check does notice.
    if (await pathExists(this.fs, absolutePath)) await this.fs.unlink(absolutePath);
    await this.fs.writeFile(absolutePath, content, "utf8");
  }

  async readFile(workspaceId: string, path: string): Promise<string> {
    const absolutePath = resolveWorkspacePath(workspaceId, path);
    try {
      const content = await this.fs.readFile(absolutePath, { encoding: "utf8" });
      return typeof content === "string" ? content : new TextDecoder().decode(content);
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) throw new FileNotFoundError(normalizeWorkspacePath(path));
      throw error;
    }
  }

  async removeFile(workspaceId: string, path: string): Promise<void> {
    const normalized = this.mutablePath(path);
    try {
      await this.fs.unlink(resolveWorkspacePath(workspaceId, normalized));
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) throw new FileNotFoundError(normalized);
      throw error;
    }
  }

  async createDirectory(workspaceId: string, path: string): Promise<void> {
    await ensureDirectory(this.fs, resolveWorkspacePath(workspaceId, this.mutablePath(path)));
  }

  async listFiles(workspaceId: string, path = ""): Promise<VirtualFileEntry[]> {
    const start = normalizeWorkspacePath(path);
    const entries: VirtualFileEntry[] = [];
    await this.walk(workspaceId, start, entries);
    return entries.sort((a, b) => a.path.localeCompare(b.path));
  }

  async exists(workspaceId: string, path: string): Promise<boolean> {
    return pathExists(this.fs, resolveWorkspacePath(workspaceId, path));
  }

  async resetWorkspace(workspaceId: string): Promise<void> {
    const root = workspaceRoot(workspaceId);
    await ensureDirectory(this.fs, root);
    await emptyDirectory(this.fs, root);
  }

  private async walk(
    workspaceId: string,
    relativeDir: string,
    into: VirtualFileEntry[],
  ): Promise<void> {
    const names = await this.fs.readdir(resolveWorkspacePath(workspaceId, relativeDir));
    for (const name of names) {
      const childPath = relativeDir === "" ? name : `${relativeDir}/${name}`;
      if (isGitInternalPath(childPath)) continue;
      const stats = await this.fs.lstat(resolveWorkspacePath(workspaceId, childPath));
      if (stats.isDirectory()) {
        into.push({ path: childPath, name, type: "directory" });
        await this.walk(workspaceId, childPath, into);
      } else {
        into.push({ path: childPath, name, type: "file" });
      }
    }
  }

  /**
   * Mutations must target a real path inside the working tree. The workspace root itself and
   * the `.git` directory are off-limits so content setup can never corrupt a repository.
   */
  private mutablePath(path: string): string {
    const normalized = normalizeWorkspacePath(path);
    if (normalized === "") throw new UnsafePathError(path, "cannot modify the workspace root");
    if (isGitInternalPath(normalized)) {
      throw new UnsafePathError(path, "cannot modify Git internals directly");
    }
    return normalized;
  }
}
