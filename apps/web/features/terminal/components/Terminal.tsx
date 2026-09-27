"use client";

import "@xterm/xterm/css/xterm.css";

import { type Ref } from "react";
import { useTerminal, type TerminalHandle } from "../hooks/use-terminal";
import { type TerminalExecutor } from "../services/terminal-executor";
import { useTerminalStore } from "../state/use-terminal-store";

export interface TerminalProps {
  executor: TerminalExecutor;
  ready: boolean;
  banner?: string;
  handleRef?: Ref<TerminalHandle>;
}

export function Terminal({ executor, ready, banner, handleRef }: TerminalProps) {
  const containerRef = useTerminal({ executor, ready, banner, handleRef });
  const announcement = useTerminalStore((state) => state.lastAnnouncement);

  return (
    <div className="relative h-full min-h-0 bg-terminal px-3 pt-2 pb-1">
      <div
        ref={containerRef}
        data-testid="terminal"
        className="h-full w-full"
        onClick={(event) => {
          event.currentTarget.querySelector("textarea")?.focus();
        }}
      />
      {ready ? null : (
        <p
          className="absolute inset-x-0 top-3 px-4 font-mono text-small text-fg-muted"
          role="status"
        >
          Preparing your workspace…
        </p>
      )}
      {/* xterm renders to a canvas-like grid; this mirrors each command's output for screen readers. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
