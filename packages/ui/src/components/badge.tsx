import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentProps } from "react";
import { cn } from "../lib/cn";

/** Compact rectangular chip. Always pair color with text (and ideally an icon). */
export const badgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-micro font-semibold tracking-wide whitespace-nowrap uppercase [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "border-border-strong bg-elevated text-fg-muted",
        accent: "border-accent-border bg-accent-soft text-accent",
        branch: "border-branch/30 bg-branch-soft text-branch",
        success: "border-success/30 bg-success-soft text-success",
        warning: "border-warning/30 bg-warning-soft text-warning",
        danger: "border-danger/30 bg-danger-soft text-danger",
      },
      mono: {
        true: "font-mono tracking-normal normal-case",
        false: "",
      },
    },
    defaultVariants: { tone: "neutral", mono: false },
  },
);

export interface BadgeProps extends ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, mono, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, mono }), className)} {...props} />;
}
