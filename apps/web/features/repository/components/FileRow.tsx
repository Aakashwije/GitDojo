import { type FileState } from "@gitdojo/shared-types";
import { cn } from "@gitdojo/ui";
import { FileText } from "lucide-react";
import { GitStatusBadge } from "./GitStatusBadge";

/**
 * One file in a working-tree / staging list. Rows mount with a short movement animation so a
 * file visibly "arrives" when a command moves it between areas.
 */
export function FileRow({ file, animation }: { file: FileState; animation: "enter" | "move-in" }) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-hover",
        animation === "move-in" ? "animate-gd-move-in" : "animate-gd-enter",
      )}
      data-testid="file-row"
      data-path={file.path}
      data-status={file.status}
    >
      <span className="flex min-w-0 items-center gap-2">
        <FileText className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
        <span className="truncate font-mono text-small text-fg">{file.path}</span>
      </span>
      <GitStatusBadge status={file.status} change={file.change} />
    </li>
  );
}
