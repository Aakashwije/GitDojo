import type FS from "@isomorphic-git/lightning-fs";

/** The concrete filesystem shared by the virtual filesystem service and the Git engine. */
export type GitDojoFs = FS;

export interface VirtualFileEntry {
  /** Workspace-relative path, e.g. `src/index.ts`. */
  path: string;
  name: string;
  type: "file" | "directory";
}

export interface VirtualFileSystem {
  createWorkspace(workspaceId: string): Promise<void>;
  writeFile(workspaceId: string, path: string, content: string): Promise<void>;
  readFile(workspaceId: string, path: string): Promise<string>;
  removeFile(workspaceId: string, path: string): Promise<void>;
  createDirectory(workspaceId: string, path: string): Promise<void>;
  /** Lists entries under `path` (default: workspace root) recursively, excluding `.git`. */
  listFiles(workspaceId: string, path?: string): Promise<VirtualFileEntry[]>;
  exists(workspaceId: string, path: string): Promise<boolean>;
  /** Removes everything in the workspace, including any Git repository. */
  resetWorkspace(workspaceId: string): Promise<void>;
}
