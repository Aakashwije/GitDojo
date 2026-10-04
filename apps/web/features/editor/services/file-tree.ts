export interface FileTreeNode {
  /** Last path segment. */
  name: string;
  /** Workspace-relative path, e.g. `src/auth.ts`. */
  path: string;
  type: "file" | "directory";
  /** Directories only; folders first, then files, each alphabetical. */
  children: FileTreeNode[];
}

function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  nodes.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1,
  );
  for (const node of nodes) sortNodes(node.children);
  return nodes;
}

/** Builds a folder tree from a flat list of file paths (directories are implied by the paths). */
export function buildFileTree(paths: Iterable<string>): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const directories = new Map<string, FileTreeNode>();

  for (const path of new Set(paths)) {
    const segments = path.split("/").filter(Boolean);
    let siblings = root;
    for (const [index, name] of segments.entries()) {
      const nodePath = segments.slice(0, index + 1).join("/");
      if (index === segments.length - 1) {
        siblings.push({ name, path: nodePath, type: "file", children: [] });
        break;
      }
      let directory = directories.get(nodePath);
      if (!directory) {
        directory = { name, path: nodePath, type: "directory", children: [] };
        directories.set(nodePath, directory);
        siblings.push(directory);
      }
      siblings = directory.children;
    }
  }
  return sortNodes(root);
}

/** Every directory path in a tree, e.g. to expand them all. */
export function directoryPaths(nodes: readonly FileTreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.type === "directory" ? [node.path, ...directoryPaths(node.children)] : [],
  );
}
