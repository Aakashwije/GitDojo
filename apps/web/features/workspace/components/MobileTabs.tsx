"use client";

import { cn } from "@gitdojo/ui";
import {
  BookOpen,
  GitCommitHorizontal,
  Layers,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";

export type WorkspaceTab = "lesson" | "terminal" | "graph" | "files";

const TABS: { id: WorkspaceTab; label: string; icon: LucideIcon }[] = [
  { id: "lesson", label: "Lesson", icon: BookOpen },
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
  { id: "graph", label: "Graph", icon: GitCommitHorizontal },
  { id: "files", label: "Files", icon: Layers },
];

/** Bottom navigation for phones; tablets and desktops show every panel at once. */
export function MobileTabs({
  active,
  onChange,
}: {
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
}) {
  return (
    <nav
      aria-label="Workspace panels"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-app/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
    >
      <ul className="grid grid-cols-4">
        {TABS.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <button
              type="button"
              aria-pressed={active === id}
              onClick={() => {
                onChange(id);
              }}
              className={cn(
                "flex h-14 w-full flex-col items-center justify-center gap-1 text-micro font-medium transition-colors",
                active === id ? "text-accent" : "text-fg-muted hover:text-fg",
              )}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
