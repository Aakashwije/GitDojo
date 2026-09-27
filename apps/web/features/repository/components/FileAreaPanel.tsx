import { cn, Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@gitdojo/ui";
import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

export interface FileAreaPanelProps {
  title: string;
  description: string;
  icon: LucideIcon;
  count?: number;
  testId: string;
  className?: string;
  children: ReactNode;
}

/** Shared frame for the Working Tree, Staging Area and Repository panels. */
export function FileAreaPanel({
  title,
  description,
  icon: Icon,
  count,
  testId,
  className,
  children,
}: FileAreaPanelProps) {
  return (
    <Panel aria-label={title} data-testid={testId} className={cn("bg-surface", className)}>
      <PanelHeader>
        <div className="min-w-0">
          <PanelTitle>
            <Icon aria-hidden="true" />
            {title}
            {count !== undefined && count > 0 ? (
              <span className="rounded-sm bg-elevated px-1.5 font-mono text-micro text-fg-secondary">
                {count}
              </span>
            ) : null}
          </PanelTitle>
          <PanelDescription>{description}</PanelDescription>
        </div>
      </PanelHeader>
      <PanelBody className="p-2">{children}</PanelBody>
    </Panel>
  );
}
