"use client";

import { cn, IconButton, Tooltip } from "@gitdojo/ui";
import { ChevronRight, FilePlus, FileText, Folder, FolderOpen, Trash2 } from "lucide-react";
import { useMemo, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { type ExplorerFile } from "../services/file-status";
import { buildFileTree, type FileTreeNode } from "../services/file-tree";
import { FileStatusIndicator } from "./FileStatusIndicator";

export interface FileExplorerProps {
  files: ExplorerFile[];
  activePath: string | null;
  readOnly: boolean;
  onOpen: (path: string) => void;
  onCreate: (path: string) => Promise<void>;
  onDelete: (path: string) => Promise<void>;
  className?: string;
}

function describe(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/^Unsafe path "[^"]*": /, "")
    : String(error);
}

/** The working tree as a folder tree, with each file's Git status letter. */
export function FileExplorer({
  files,
  activePath,
  readOnly,
  onOpen,
  onCreate,
  onDelete,
  className,
}: FileExplorerProps) {
  const tree = useMemo(() => buildFileTree(files.map((file) => file.path)), [files]);
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  // Folders start expanded; only the ones the learner collapses are remembered.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggle = (path: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const path = name.trim();
    if (path === "") return;
    try {
      await onCreate(path);
      setCreating(false);
      setName("");
      setError(null);
    } catch (caught) {
      setError(describe(caught));
    }
  };

  const cancelOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    setCreating(false);
    setName("");
    setError(null);
  };

  const renderNode = (node: FileTreeNode, depth: number) => {
    const indent = { paddingLeft: `${String(depth * 12 + 8)}px` };
    if (node.type === "directory") {
      const open = !collapsed.has(node.path);
      return (
        <li key={node.path} role="treeitem" aria-expanded={open} aria-selected={false}>
          <button
            type="button"
            onClick={() => {
              toggle(node.path);
            }}
            style={indent}
            className="flex h-7 w-full items-center gap-1.5 pr-2 text-left text-small text-fg-secondary hover:bg-hover"
          >
            <ChevronRight
              className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
              aria-hidden="true"
            />
            {open ? (
              <FolderOpen className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            ) : (
              <Folder className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {open ? (
            <ul role="group">{node.children.map((child) => renderNode(child, depth + 1))}</ul>
          ) : null}
        </li>
      );
    }

    const file = byPath.get(node.path);
    const exists = file?.exists ?? true;
    const active = node.path === activePath;
    return (
      <li
        key={node.path}
        role="treeitem"
        aria-selected={active}
        className={cn("group flex items-center pr-1", active ? "bg-accent-soft" : "hover:bg-hover")}
        data-testid="explorer-file"
        data-path={node.path}
      >
        <button
          type="button"
          disabled={!exists}
          onClick={() => {
            onOpen(node.path);
          }}
          title={exists ? `Open ${node.path}` : `${node.path} was deleted from the working tree`}
          style={{ paddingLeft: `${String(depth * 12 + 26)}px` }}
          className={cn(
            "flex h-7 min-w-0 flex-1 items-center gap-1.5 text-left text-small disabled:cursor-default",
            active ? "text-fg" : "text-fg-secondary",
            !exists && "text-fg-faint line-through",
          )}
        >
          <FileText className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
          <span className="truncate font-mono text-caption">{node.name}</span>
        </button>
        {readOnly || !exists ? null : (
          <Tooltip content="Delete file">
            <IconButton
              aria-label={`Delete ${node.path}`}
              className="size-6 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [&_svg]:size-3.5"
              onClick={() => {
                void onDelete(node.path).catch((caught: unknown) => {
                  setError(describe(caught));
                });
              }}
            >
              <Trash2 />
            </IconButton>
          </Tooltip>
        )}
        <FileStatusIndicator indicator={file?.indicator ?? null} className="mr-1" />
      </li>
    );
  };

  return (
    <nav aria-label="Files" className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border-subtle pr-1 pl-3">
        <h3 className="text-micro font-semibold tracking-wider text-fg-muted uppercase">Project</h3>
        {readOnly ? null : (
          <Tooltip content="New file">
            <IconButton
              aria-label="New file"
              className="size-7"
              onClick={() => {
                setCreating(true);
                setError(null);
              }}
            >
              <FilePlus />
            </IconButton>
          </Tooltip>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {creating ? (
          <form onSubmit={(event) => void submit(event)} className="px-2 py-1">
            <input
              autoFocus
              aria-label="New file name"
              placeholder="src/notes.md"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              onKeyDown={cancelOnEscape}
              onBlur={() => {
                if (name.trim() === "") setCreating(false);
              }}
              className="h-7 w-full rounded-sm border border-border-input bg-editor px-2 font-mono text-caption text-fg outline-none placeholder:text-fg-placeholder focus:border-accent"
            />
          </form>
        ) : null}
        {error ? (
          <p role="alert" className="px-3 py-1 text-caption text-danger">
            {error}
          </p>
        ) : null}
        {tree.length === 0 ? (
          <p className="px-3 py-2 text-caption text-fg-muted">No files yet.</p>
        ) : (
          <ul role="tree" aria-label="Project files">
            {tree.map((node) => renderNode(node, 0))}
          </ul>
        )}
      </div>
    </nav>
  );
}
