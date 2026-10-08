"use client";

import { type PlaygroundScenario } from "@gitdojo/shared-types";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@gitdojo/ui";
import { FolderGit2 } from "lucide-react";
import { useState } from "react";
import { renderInline } from "@/components/content/rich-text";

export interface ScenarioDialogProps {
  scenarios: readonly PlaygroundScenario[];
  currentId: string | null;
  disabled?: boolean;
  onLoad: (scenario: PlaygroundScenario) => Promise<void>;
}

/** Picks a ready-made repository. Loading one replaces the playground's current repository. */
export function ScenarioDialog({ scenarios, currentId, disabled, onLoad }: ScenarioDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const load = async (scenario: PlaygroundScenario) => {
    setLoading(scenario.id);
    try {
      await onLoad(scenario);
      setOpen(false);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled}>
          <FolderGit2 /> <span className="max-sm:sr-only">Scenarios</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[640px]">
        <DialogTitle>Load a scenario</DialogTitle>
        <DialogDescription>
          Each scenario is a ready-made repository. Loading one replaces the playground&apos;s
          current repository.
        </DialogDescription>
        <ul className="mt-5 space-y-2" aria-label="Scenarios">
          {scenarios.map((scenario) => (
            <li
              key={scenario.id}
              data-testid="scenario"
              data-scenario={scenario.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-border-subtle bg-panel p-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-small font-semibold text-fg">
                  {scenario.title}
                  {scenario.id === currentId ? <Badge tone="accent">Current</Badge> : null}
                </p>
                <p className="mt-1 text-caption text-fg-secondary">
                  {renderInline(scenario.description)}
                </p>
              </div>
              <Button
                size="sm"
                variant={scenario.id === currentId ? "secondary" : "primary"}
                disabled={loading !== null}
                onClick={() => void load(scenario)}
              >
                {loading === scenario.id ? "Loading…" : "Load"}
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
