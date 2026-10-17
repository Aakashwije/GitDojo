"use client";

import {
  buildProgressReport,
  DEFAULT_LEARNER_NAME,
  MAX_LEARNER_NAME_LENGTH,
} from "@gitdojo/progress";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@gitdojo/ui";
import { FileDown, RotateCcw, TriangleAlert } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useAccountSession, type AccountSession } from "@/features/auth";
import {
  createProgressReportPdf,
  isPrintableName,
  loadReportLogo,
  reportFileName,
} from "../services/progress-report-pdf";
import { useProgressStore } from "../state/use-progress-store";

/**
 * A signed-in learner's profile name, only when it is a real full name. The session's display
 * name may be a username or the part of the email before the "@", which is not a name to print
 * on a report, so those are never suggested.
 */
export function suggestedReportName(session: AccountSession | null): string {
  if (session?.status !== "signed-in") return "";
  const { name, email } = session.user;
  const localPart = email?.split("@")[0]?.toLowerCase();
  const looksLikeFullName = /\S\s+\S/.test(name);
  if (!looksLikeFullName || name.includes("@") || name.toLowerCase() === localPart) return "";
  return isPrintableName(name) ? name : "";
}

function download(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Give the browser a moment to start the download before releasing the data.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

type ExportState = { status: "idle" } | { status: "busy" } | { status: "error"; message: string };

/**
 * "Export PDF report": an optional name, then a PDF created in this browser from the progress
 * the dashboard shows. Nothing is uploaded; only GitDojo's own logo is loaded from this site.
 */
export function ProgressReportExport({ onExported }: { onExported: (message: string) => void }) {
  const session = useAccountSession((state) => state.session);
  const ready = useProgressStore((state) => state.progress !== null && state.catalog !== null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [state, setState] = useState<ExportState>({ status: "idle" });
  // A second click while a report is being made does nothing, even before React re-renders.
  const running = useRef(false);
  const nameId = useId();
  const hintId = useId();
  const errorId = useId();
  const nameError = isPrintableName(name)
    ? null
    : "This name uses letters the report's font can't show yet. Use Latin letters, or leave it blank.";

  const start = () => {
    setName(suggestedReportName(session));
    setState({ status: "idle" });
    setOpen(true);
  };

  const create = async () => {
    if (running.current || nameError) return;
    running.current = true;
    setState({ status: "busy" });
    try {
      const { progress, catalog } = useProgressStore.getState();
      if (!progress || !catalog) throw new Error("progress is not loaded");
      const exportedAt = Date.now();
      const report = buildProgressReport(progress, catalog, {
        learnerName: name,
        exportedAt,
        origin: window.location.origin,
      });
      const { blob, pages } = await createProgressReportPdf(report, {
        logo: await loadReportLogo(),
      });
      download(reportFileName(exportedAt), blob);
      setOpen(false);
      setState({ status: "idle" });
      onExported(`Progress report downloaded (${String(pages)} page${pages === 1 ? "" : "s"}).`);
    } catch (error) {
      console.error("[gitdojo] could not create the progress report", error);
      setState({
        status: "error",
        message: "We couldn't create the PDF. Your progress is unchanged. Please try again.",
      });
    } finally {
      running.current = false;
    }
  };

  const busy = state.status === "busy";
  return (
    <>
      <Button variant="secondary" onClick={start} disabled={!ready} data-testid="export-report">
        <FileDown /> Export PDF report
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Closing mid-way would hide the result; the busy state is short.
          if (!busy) setOpen(next);
        }}
      >
        <DialogContent data-testid="report-dialog" aria-busy={busy}>
          <DialogTitle>Export your progress report</DialogTitle>
          <DialogDescription>
            A PDF of your courses, skills and recent activity, created in this browser. Nothing is
            uploaded.
          </DialogDescription>
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <label htmlFor={nameId} className="text-small font-medium text-fg">
              Name on the report <span className="font-normal text-fg-muted">(optional)</span>
            </label>
            <input
              id={nameId}
              data-testid="report-name"
              value={name}
              maxLength={MAX_LEARNER_NAME_LENGTH}
              autoComplete="name"
              placeholder={DEFAULT_LEARNER_NAME}
              aria-describedby={nameError ? `${hintId} ${errorId}` : hintId}
              aria-invalid={nameError ? true : undefined}
              disabled={busy}
              onChange={(event) => {
                setName(event.target.value);
              }}
              className="focus-visible:border-border-focus mt-1.5 h-9 w-full rounded-md border border-border-input bg-panel px-3 text-small text-fg"
            />
            <p id={hintId} className="mt-1.5 text-caption text-fg-muted">
              Leave it blank to use “{DEFAULT_LEARNER_NAME}”. The name is only used in this file.
            </p>
            {nameError ? (
              <p id={errorId} className="mt-1.5 text-caption text-danger">
                {nameError}
              </p>
            ) : null}
            {state.status === "error" ? (
              <p
                role="alert"
                data-testid="report-error"
                className="mt-3 flex items-start gap-2 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-small text-danger"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {state.message}
              </p>
            ) : null}
            <p role="status" className="sr-only">
              {busy ? "Creating your progress report…" : ""}
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={busy || nameError !== null}
                data-testid="report-download"
              >
                {busy ? (
                  "Creating PDF…"
                ) : state.status === "error" ? (
                  <>
                    <RotateCcw /> Try again
                  </>
                ) : (
                  <>
                    <FileDown /> Download PDF
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
