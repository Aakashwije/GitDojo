"use client";

import { cn } from "@gitdojo/ui";
import { useMemo, useState } from "react";
import { classifyConflictLines, type ConflictLineKind } from "../services/conflict-lines";

// Backgrounds only: the textarea above draws the text itself.
const LINE_STYLES: Record<ConflictLineKind, string> = {
  plain: "",
  "ours-marker": "bg-accent/30",
  ours: "bg-accent-soft",
  separator: "bg-border-strong",
  theirs: "bg-branch-soft",
  "theirs-marker": "bg-branch/30",
};

// Shared by the textarea and the highlight layer underneath it; they must match exactly.
const TEXT_METRICS = "px-3 py-2.5 font-mono text-caption leading-5 whitespace-pre [tab-size:4]";

export interface ConflictTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}

/**
 * A plain textarea over a highlight layer: conflict markers and the "current" / "incoming"
 * regions are shaded, but the learner edits ordinary text. Nothing is resolved automatically.
 */
export function ConflictTextEditor({ value, onChange, label, className }: ConflictTextEditorProps) {
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const lines = useMemo(() => classifyConflictLines(value), [value]);

  return (
    <div
      className={cn(
        "focus-within:border-border-focus relative overflow-hidden rounded-md border border-border-input bg-editor",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn("pointer-events-none absolute top-0 left-0 min-w-full", TEXT_METRICS)}
        style={{ transform: `translate(${String(-scroll.left)}px, ${String(-scroll.top)}px)` }}
      >
        {lines.map((line, index) => (
          <div key={index} className={cn("-mx-3 px-3 text-transparent", LINE_STYLES[line.kind])}>
            {line.text === "" ? " " : line.text}
          </div>
        ))}
      </div>
      <textarea
        aria-label={label}
        data-testid="conflict-editor-input"
        value={value}
        spellCheck={false}
        wrap="off"
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onScroll={(event) => {
          setScroll({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft });
        }}
        className={cn(
          "relative block h-full w-full resize-none overflow-auto bg-transparent text-fg caret-fg outline-none",
          TEXT_METRICS,
        )}
      />
    </div>
  );
}
