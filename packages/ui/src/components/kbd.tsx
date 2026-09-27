import { type ComponentProps } from "react";
import { cn } from "../lib/cn";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border-strong bg-elevated px-1 font-mono text-micro text-fg-secondary",
        className,
      )}
      {...props}
    />
  );
}
