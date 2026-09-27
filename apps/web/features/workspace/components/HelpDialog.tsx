"use client";

import { BUILTIN_PROGRAMS, GIT_COMMAND_SPECS } from "@gitdojo/command-parser";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Kbd,
} from "@gitdojo/ui";
import { CircleHelp } from "lucide-react";

const SHORTCUTS = [
  { keys: ["↑", "↓"], label: "Command history" },
  { keys: ["Ctrl", "L"], label: "Clear the terminal" },
  { keys: ["Ctrl", "C"], label: "Cancel the current line" },
];

export function HelpDialog() {
  const commands = [
    ...Object.values(GIT_COMMAND_SPECS).map((spec) => ({
      usage: spec.usage,
      summary: spec.summary,
    })),
    ...Object.entries(BUILTIN_PROGRAMS).map(([usage, summary]) => ({ usage, summary })),
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <CircleHelp /> <span className="max-sm:sr-only">Help</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[520px]">
        <DialogTitle>Terminal help</DialogTitle>
        <DialogDescription>
          Commands run against a sandboxed repository in your browser. Nothing touches your machine.
        </DialogDescription>
        <ul className="mt-5 space-y-2">
          {commands.map(({ usage, summary }) => (
            <li
              key={usage}
              className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3"
            >
              <code className="shrink-0 font-mono text-caption text-fg sm:w-48">{usage}</code>
              <span className="text-small text-fg-secondary">{summary}</span>
            </li>
          ))}
        </ul>
        <ul className="mt-5 space-y-2 border-t border-border-subtle pt-4">
          {SHORTCUTS.map(({ keys, label }) => (
            <li
              key={label}
              className="flex items-center justify-between text-small text-fg-secondary"
            >
              {label}
              <span className="flex gap-1">
                {keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
