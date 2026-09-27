import { type ComponentProps } from "react";
import { cn } from "../lib/cn";

/** Standard container for every workspace region (lesson, terminal, graph, file panels). */
export function Panel({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-panel",
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({ className, ...props }: ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4 py-2",
        className,
      )}
      {...props}
    />
  );
}

export function PanelTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "flex items-center gap-2 text-small font-semibold text-fg [&_svg]:size-4 [&_svg]:text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function PanelDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-caption text-fg-muted", className)} {...props} />;
}

export function PanelActions({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex shrink-0 items-center gap-1", className)} {...props} />;
}

export function PanelBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-auto p-4", className)} {...props} />;
}

export function PanelFooter({ className, ...props }: ComponentProps<"footer">) {
  return (
    <footer
      className={cn("shrink-0 border-t border-border-subtle px-4 py-3", className)}
      {...props}
    />
  );
}
