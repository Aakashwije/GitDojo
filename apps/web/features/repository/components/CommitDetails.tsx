"use client";

import { type CommitState } from "@gitdojo/shared-types";
import { IconButton } from "@gitdojo/ui";
import { X } from "lucide-react";
import { type ReactNode } from "react";
import { formatRelativeTime, formatTimestamp } from "@/lib/time";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-micro font-semibold tracking-wider text-fg-muted uppercase">{label}</dt>
      <dd className="mt-0.5 text-small text-fg">{children}</dd>
    </div>
  );
}

export function CommitDetails({ commit, onClose }: { commit: CommitState; onClose: () => void }) {
  return (
    <aside
      aria-label="Commit details"
      data-testid="commit-details"
      className="animate-gd-enter rounded-lg border border-border-strong bg-elevated p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-small font-semibold text-fg">Commit</p>
        <IconButton aria-label="Close commit details" onClick={onClose} className="-mt-1 -mr-2">
          <X />
        </IconButton>
      </div>
      <dl className="mt-2 space-y-3">
        <Field label="Hash">
          <span className="font-mono text-caption break-all text-warning">{commit.oid}</span>
        </Field>
        <Field label="Message">
          <span className="whitespace-pre-wrap">{commit.message}</span>
        </Field>
        <Field label="Author">
          {commit.authorName} <span className="text-fg-muted">&lt;{commit.authorEmail}&gt;</span>
        </Field>
        <Field label="Date">
          <time dateTime={new Date(commit.timestamp * 1000).toISOString()}>
            {formatTimestamp(commit.timestamp)}
          </time>{" "}
          <span className="text-fg-muted">({formatRelativeTime(commit.timestamp)})</span>
        </Field>
        <Field label={commit.parents.length > 1 ? "Parents" : "Parent"}>
          {commit.parents.length === 0 ? (
            <span className="text-fg-muted">None, this is the root commit</span>
          ) : (
            <span className="font-mono text-caption">
              {commit.parents.map((parent) => parent.slice(0, 7)).join(", ")}
            </span>
          )}
        </Field>
      </dl>
    </aside>
  );
}
