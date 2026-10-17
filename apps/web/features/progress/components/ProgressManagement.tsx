"use client";

import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@gitdojo/ui";
import { CloudCheck, CloudOff, RefreshCw, RotateCcw, Settings2 } from "lucide-react";
import { useState } from "react";
import { formatRelativeTime } from "@/lib/time";
import { resetProgress, syncNow, useProgressStore } from "../state/use-progress-store";
import { ProgressReportExport } from "./ProgressReportExport";

/** Download a PDF progress report, or reset progress after an explicit confirmation. */
export function ProgressManagement() {
  const signedIn = useProgressStore((state) => state.mode !== "anonymous");
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [announcement, setAnnouncement] = useState("");

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
          ? "Everything you finish, every command you run, the hints you reveal and where you left off are saved to your account and follow you to your other devices. Download a PDF report of your progress at any time."
          : "Progress is stored only in this browser. Download a PDF report of it, or start over. Playground repositories are kept either way."}
      </p>
      {signedIn ? <SyncStatus /> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <ProgressReportExport onExported={setAnnouncement} />
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
            affected. A PDF report keeps a record of what you did, but it cannot restore progress.
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

/**
 * Whether this device's progress has reached the account. Nothing is called synced until the
 * server has confirmed it, so a paused sync says so and offers to try again.
 */
function SyncStatus() {
  const sync = useProgressStore((state) => state.sync);
  const syncedAt = useProgressStore((state) => state.syncedAt);
  const [retrying, setRetrying] = useState(false);

  const last = syncedAt === null ? null : formatRelativeTime(syncedAt);
  const paused = sync === "paused";

  return (
    <p
      data-testid="sync-status"
      data-sync={sync}
      className="mt-3 flex flex-wrap items-center gap-2 text-caption text-fg-muted"
    >
      {paused ? (
        <CloudOff className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
      ) : (
        <CloudCheck
          className={cn("size-3.5 shrink-0", sync === "synced" ? "text-success" : "text-fg-muted")}
          aria-hidden="true"
        />
      )}
      <span>
        {paused
          ? "Sync paused. Your progress is safe in this browser and will be sent when your account is reachable again."
          : sync === "pending"
            ? "Saving to your account…"
            : last
              ? `Synced to your account ${last}.`
              : "Synced to your account."}
      </span>
      {paused ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={retrying}
          data-testid="retry-sync"
          onClick={() => {
            setRetrying(true);
            void syncNow().finally(() => {
              setRetrying(false);
            });
          }}
        >
          <RefreshCw /> Try now
        </Button>
      ) : null}
    </p>
  );
}
