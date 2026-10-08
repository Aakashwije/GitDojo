import { type DemoAreas, type DemoFile } from "@gitdojo/shared-types";
import { ArrowRight, Database, FileText, FolderOpen, Layers, type LucideIcon } from "lucide-react";
import { Fragment } from "react";
import { GitStatusBadge } from "@/features/repository";

const AREAS: { key: keyof DemoAreas; title: string; icon: LucideIcon }[] = [
  { key: "workingTree", title: "Working Tree", icon: FolderOpen },
  { key: "staging", title: "Staging Area", icon: Layers },
  { key: "repository", title: "Repository", icon: Database },
];

function normalize(file: DemoFile) {
  return typeof file === "string" ? { path: file, status: undefined } : file;
}

/**
 * Git's three areas side by side, mirroring the workspace's file panels, with arrows for the
 * direction work travels in: working tree → staging area → repository.
 */
export function DemoAreasView({ areas }: { areas: DemoAreas }) {
  return (
    <div
      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-stretch"
      data-testid="demo-areas"
    >
      {AREAS.map(({ key, title, icon: Icon }, index) => {
        const files = areas[key].map(normalize);
        return (
          <Fragment key={key}>
            {index > 0 ? (
              <div
                aria-hidden="true"
                className="flex items-center justify-center text-fg-faint max-sm:hidden"
              >
                <ArrowRight className="size-3.5" />
              </div>
            ) : null}
            <section
              aria-label={title}
              className="min-w-0 rounded-md border border-border-subtle bg-surface p-2.5"
            >
              <h4 className="flex items-center gap-1.5 text-caption font-semibold text-fg-secondary">
                <Icon className="size-3.5 text-fg-muted" aria-hidden="true" />
                {title}
              </h4>
              {files.length === 0 ? (
                <p className="mt-2 text-caption text-fg-muted">Empty</p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {files.map((file) => (
                    <li
                      // Re-mount when a file's state changes so it visibly moves.
                      key={`${file.path}:${file.status ?? ""}`}
                      className="flex animate-gd-move-in flex-wrap items-center justify-between gap-x-2 gap-y-1"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <FileText className="size-3.5 shrink-0 text-fg-muted" aria-hidden="true" />
                        <span className="truncate font-mono text-caption text-fg">{file.path}</span>
                      </span>
                      {file.status ? <GitStatusBadge status={file.status} /> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Fragment>
        );
      })}
    </div>
  );
}
