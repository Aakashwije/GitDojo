"use client";

import { type ProgressCatalog } from "@gitdojo/progress";
import { IconButton } from "@gitdojo/ui";
import { TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { initProgress, useProgressStore } from "../state/use-progress-store";

/** Loads local progress for every page and reports when it cannot be saved. */
export function ProgressProvider({ catalog }: { catalog: ProgressCatalog }) {
  useEffect(() => {
    void initProgress(catalog);
  }, [catalog]);
  useEffect(() => {
    // `data-progress` on <html>: "loading", "saving" or "saved". Lets end-to-end tests wait for
    // writes to land before reloading, instead of sleeping.
    const root = document.documentElement;
    const reflect = ({ status, saving }: { status: string; saving: boolean }) => {
      root.dataset.progress = status === "ready" ? (saving ? "saving" : "saved") : "loading";
    };
    reflect(useProgressStore.getState());
    return useProgressStore.subscribe(reflect);
  }, []);
  return <ProgressStatusNotice />;
}

/**
 * A non-blocking notice when progress is not being saved: learning always carries on, but the
 * learner should know their progress may not survive closing the tab.
 */
export function ProgressStatusNotice() {
  const persistence = useProgressStore((state) => state.persistence);
  const saveError = useProgressStore((state) => state.saveError);
  const message = saveError ?? (persistence?.mode === "memory" ? persistence.reason : null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  return (
    <div role="status" aria-live="polite" className="contents">
      {message && dismissed !== message ? (
        <div
          data-testid="progress-status"
          className="fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-warning/40 bg-elevated p-3 shadow-xl shadow-black/40 max-md:bottom-[calc(4rem+env(safe-area-inset-bottom))] max-md:left-4"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-small text-fg-secondary">
            <span className="font-medium text-fg">Progress not saved. </span>
            {message}
          </p>
          <IconButton
            aria-label="Dismiss"
            className="-mt-1 -mr-1 shrink-0"
            onClick={() => {
              setDismissed(message);
            }}
          >
            <X />
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}
