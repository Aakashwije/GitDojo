import { createGitEngine } from "../engine/isomorphic-git-engine";
import { type GitEngine } from "../engine/git-engine";
import { WorkspaceFileSystem } from "../filesystem/workspace-file-system";
import { type GitDojoFs } from "../filesystem/types";
import { createTestFs } from "./create-test-fs";

export interface TestWorkspace {
  fs: GitDojoFs;
  files: WorkspaceFileSystem;
  git: GitEngine;
  workspaceId: string;
}

export async function createTestWorkspace(
  initialFiles: Record<string, string> = {},
  workspaceId = "test-workspace",
): Promise<TestWorkspace> {
  const fs = createTestFs();
  const files = new WorkspaceFileSystem(fs);
  await files.createWorkspace(workspaceId);
  for (const [path, content] of Object.entries(initialFiles)) {
    await files.writeFile(workspaceId, path, content);
  }
  return { fs, files, git: createGitEngine({ fs, workspaceId }), workspaceId };
}
