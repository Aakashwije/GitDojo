"use client";

import { type ConflictState } from "@gitdojo/shared-types";
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@gitdojo/ui";
import { CircleCheck, Save, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useRepositoryStore } from "@/features/repository/state/use-repository-store";
import { countConflictBlocks, hasMarkerLines } from "../services/conflict-lines";
import { useConflictEditorStore } from "../state/use-conflict-editor-store";
import { ConflictTextEditor } from "./ConflictTextEditor";

export interface ConflictEditorDialogProps {
  readFile: (path: string) => Promise<string>;
  saveFile: (path: string, content: string) => Promise<void>;
}

type LoadState =
  { status: "loading" } | { status: "ready"; saved: string } | { status: "error"; message: string };

function VersionPanel({
  title,
  label,
  content,
  tone,
}: {
  title: string;
  label: string;
  content: string | undefined;
  tone: "accent" | "branch";
}) {
  return (
    <section aria-label={title} className="flex min-h-0 flex-col">
      <h3 className="mb-1.5 flex items-center gap-2 text-caption font-semibold text-fg-secondary">
        <span
          aria-hidden="true"
          className={cn("size-2 rounded-full", tone === "accent" ? "bg-accent" : "bg-branch")}
        />
        {title}
        <span className="font-mono font-normal text-fg-muted">{label}</span>
      </h3>
      <pre className="min-h-0 flex-1 overflow-auto rounded-md border border-border-subtle bg-surface px-3 py-2.5 font-mono text-caption leading-5 text-fg-secondary">
        {content ?? "(file deleted on this side)"}
      </pre>
    </section>
  );
}

/**
 * Edits a conflicted file by hand. The learner removes the markers and keeps what they want;
 * saving writes the working tree only. Marking the conflict resolved is still `git add`.
 */
export function ConflictEditorDialog({ readFile, saveFile }: ConflictEditorDialogProps) {
  const path = useConflictEditorStore((state) => state.path);
  const close = useConflictEditorStore((state) => state.close);
  return (
    <Dialog
      open={path !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        data-testid="conflict-editor"
        className="flex h-[calc(100dvh-2rem)] max-w-[1100px] flex-col gap-0 p-0 sm:h-[85dvh]"
      >
        {/* Keyed by path: each file opens with fresh state. */}
        {path === null ? null : (
          <ConflictEditorBody
            key={path}
            path={path}
            readFile={readFile}
            saveFile={saveFile}
            onClose={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConflictEditorBody({
  path,
  readFile,
  saveFile,
  onClose,
}: ConflictEditorDialogProps & { path: string; onClose: () => void }) {
  const repository = useRepositoryStore((state) => state.repositoryState);
  const conflict: ConflictState | undefined = repository.conflicts.find((c) => c.path === path);

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readFile(path).then(
      (content) => {
        if (cancelled) return;
        setDraft(content);
        setLoad({ status: "ready", saved: content });
      },
      (error: unknown) => {
        if (cancelled) return;
        console.error("[gitdojo] could not open file", error);
        setLoad({ status: "error", message: "This file could not be opened." });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, readFile]);

  const blocks = countConflictBlocks(draft);
  const markersLeft = hasMarkerLines(draft);
  const dirty = load.status === "ready" && draft !== load.saved;
  const savedClean = load.status === "ready" && !dirty && !hasMarkerLines(load.saved);

  const save = async () => {
    setSaving(true);
    try {
      await saveFile(path, draft);
      setLoad({ status: "ready", saved: draft });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="border-b border-border-subtle px-5 py-4 pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="danger">
            <TriangleAlert aria-hidden="true" /> Conflict
          </Badge>
          <DialogTitle className="font-mono text-body">{path}</DialogTitle>
        </div>
        <DialogDescription className="mt-1.5">
          Keep the lines you want and delete the rest, including every{" "}
          <code className="gd-code">{"<<<<<<<"}</code>, <code className="gd-code">=======</code> and{" "}
          <code className="gd-code">{">>>>>>>"}</code> line. Then save, and run{" "}
          <code className="gd-code">git add {path}</code> in the terminal.
        </DialogDescription>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-5 lg:grid-cols-[3fr_2fr] lg:overflow-hidden">
        <div className="flex min-h-72 flex-col">
          <p className="mb-1.5 flex items-center justify-between text-caption text-fg-secondary">
            <span className="font-semibold">Your file</span>
            <span
              data-testid="conflict-marker-status"
              className={cn(
                "flex items-center gap-1",
                markersLeft ? "text-danger" : "text-success",
              )}
            >
              {markersLeft ? (
                <>
                  <TriangleAlert className="size-3.5" aria-hidden="true" />
                  {blocks > 0
                    ? `${String(blocks)} conflict${blocks === 1 ? "" : "s"} left`
                    : "Marker lines left"}
                </>
              ) : (
                <>
                  <CircleCheck className="size-3.5" aria-hidden="true" /> No markers left
                </>
              )}
            </span>
          </p>
          {load.status === "error" ? (
            <p role="alert" className="text-small text-danger">
              {load.message}
            </p>
          ) : (
            <ConflictTextEditor
              value={draft}
              onChange={setDraft}
              label={`Contents of ${path}`}
              className="min-h-0 flex-1"
            />
          )}
        </div>
        <div className="grid min-h-0 gap-4 lg:grid-rows-2">
          <VersionPanel
            title="Current"
            label={`HEAD · ${repository.currentBranch ?? "HEAD"}`}
            content={conflict?.ours}
            tone="accent"
          />
          <VersionPanel
            title="Incoming"
            label={repository.merge?.branch ?? ""}
            content={conflict?.theirs}
            tone="branch"
          />
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-3">
        <p
          className="text-caption text-fg-muted"
          aria-live="polite"
          data-testid="conflict-save-hint"
        >
          {savedClean ? (
            <span className="text-success">
              Saved. Now run <code className="gd-code">git add {path}</code> to mark it resolved.
            </span>
          ) : dirty ? (
            "Unsaved changes"
          ) : (
            "GitDojo never resolves conflicts for you."
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            disabled={!dirty || saving}
            data-testid="save-conflict"
            onClick={() => void save()}
          >
            <Save /> Save file
          </Button>
        </div>
      </footer>
    </>
  );
}
