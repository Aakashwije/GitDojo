"use client";

import { exportFileName } from "@gitdojo/progress";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@gitdojo/ui";
import { Download, RotateCcw, Settings2 } from "lucide-react";
import { useState } from "react";
import {
  exportCurrentProgress,
  resetProgress,
  useProgressStore,
} from "../state/use-progress-store";

function download(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Give the browser a moment to start the download before releasing the data.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/** Export progress as JSON, or reset it after an explicit confirmation. */
export function ProgressManagement() {
  const signedIn = useProgressStore((state) => state.mode !== "anonymous");
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const exportJson = () => {
    const now = Date.now();
    const data = exportCurrentProgress(now);
    if (!data) return;
    download(exportFileName(now), `${JSON.stringify(data, null, 2)}\n`);
    setAnnouncement("Progress exported.");
  };

  const reset = async () => {
    setResetting(true);
    try {
      await resetProgress();
      setOpen(false);
      setAnnouncement("Learning progress reset.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <section
      aria-labelledby="manage-heading"
      className="rounded-xl border border-border-subtle bg-surface p-5"
    >
      <h2 id="manage-heading" className="flex items-center gap-2 text-body font-semibold text-fg">
        <Settings2 className="size-4 text-fg-muted" aria-hidden="true" />
        Your data
      </h2>
      <p className="mt-2 max-w-2xl text-small text-fg-secondary">
        {signedIn
          ? "Completed lessons are saved to your account. Command stats, hints and challenges stay in this browser. Export a copy as JSON."
          : "Progress is stored only in this browser. Export a copy as JSON, or start over. Playground repositories are kept either way."}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={exportJson} data-testid="export-progress">
          <Download /> Export progress
        </Button>
        {signedIn ? null : (
          <Button
            variant="danger"
            onClick={() => {
              setOpen(true);
            }}
            data-testid="reset-progress"
          >
            <RotateCcw /> Reset learning progress
          </Button>
        )}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Reset learning progress?</DialogTitle>
          <DialogDescription>
            This permanently clears completed lessons and challenges, XP, command statistics, hint
            history and your last visited lesson in this browser. Your playground repository is not
            affected. Export your progress first if you may want it later.
          </DialogDescription>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={resetting}
              onClick={() => void reset()}
              data-testid="confirm-reset-progress"
            >
              <RotateCcw /> Reset progress
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
