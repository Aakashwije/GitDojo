import { type RepositoryState } from "@gitdojo/shared-types";

export type FileIndicatorTone = "muted" | "warning" | "success" | "danger";

/** The single-letter Git status shown next to a file in the explorer and on its tab. */
export interface FileIndicator {
  letter: "U" | "M" | "A" | "D" | "C";
  tone: FileIndicatorTone;
  /** Spelled out for screen readers and tooltips. */
  label: string;
}

export interface ExplorerFile {
  path: string;
  /** False for a tracked file deleted from the working tree: listed, but cannot be opened. */
  exists: boolean;
  indicator: FileIndicator | null;
}

/**
 * The working tree as the explorer shows it: every file on disk plus tracked files that were
 * deleted, each with the letter VS Code users know (U, M, A, D, C). An unstaged change wins over
 * a staged one, because that is what the learner still has to deal with.
 */
export function explorerFiles(repository: RepositoryState): ExplorerFile[] {
  const staged = new Map(repository.stagedFiles.map((file) => [file.path, file.change]));
  return repository.files.map((file): ExplorerFile => {
    const exists = file.status !== "deleted";
    switch (file.status) {
      case "conflicted":
        return {
          path: file.path,
          exists,
          indicator: { letter: "C", tone: "danger", label: "Conflict" },
        };
      case "untracked":
        return {
          path: file.path,
          exists,
          indicator: { letter: "U", tone: "muted", label: "Untracked" },
        };
      case "deleted":
        return {
          path: file.path,
          exists,
          indicator: { letter: "D", tone: "danger", label: "Deleted" },
        };
      case "modified":
        return {
          path: file.path,
          exists,
          indicator: {
            letter: "M",
            tone: "warning",
            label: staged.has(file.path) ? "Modified (some changes staged)" : "Modified",
          },
        };
      case "staged": {
        const change = staged.get(file.path);
        return {
          path: file.path,
          exists,
          indicator:
            change === "added"
              ? { letter: "A", tone: "success", label: "Staged · new file" }
              : { letter: "M", tone: "success", label: "Staged · modified" },
        };
      }
      default:
        return { path: file.path, exists, indicator: null };
    }
  });
}
