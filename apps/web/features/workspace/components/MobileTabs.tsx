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

export interface MobileTab<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

export const LESSON_TABS: MobileTab<WorkspaceTab>[] = [
  { id: "lesson", label: "Lesson", icon: BookOpen },
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
  { id: "graph", label: "Graph", icon: GitCommitHorizontal },
  { id: "files", label: "Files", icon: Layers },
];

/** Bottom navigation for phones; tablets and desktops show every panel at once. */
export function MobileTabs<T extends string>({
  active,
  onChange,
  tabs,
}: {
  active: T;
  onChange: (tab: T) => void;
  tabs: MobileTab<T>[];
}) {
  return (
    <nav
      aria-label="Workspace panels"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-app/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${String(tabs.length)}, 1fr)` }}>
        {tabs.map(({ id, label, icon: Icon }) => (
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
