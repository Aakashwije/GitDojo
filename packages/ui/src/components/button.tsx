import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { type ComponentProps } from "react";
import { cn } from "../lib/cn";

export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors duration-150 ease-out outline-none select-none focus-visible:ring-3 focus-visible:ring-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white hover:bg-accent-hover active:bg-accent-active",
        secondary: "border border-border-strong bg-panel text-fg hover:bg-hover active:bg-elevated",
        ghost: "text-fg-secondary hover:bg-hover hover:text-fg",
        danger: "border border-danger/30 bg-danger-soft text-danger hover:bg-danger/20",
      },
      size: {
        sm: "h-8 px-3 text-small [&_svg]:size-4",
        md: "h-9 px-4 text-small [&_svg]:size-4",
        lg: "h-10 px-5 text-body [&_svg]:size-[18px]",
        hero: "h-12 px-6 text-body [&_svg]:size-5",
        icon: "size-8 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /** Render the single child element with button styles (e.g. a link). */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "size"> {
  /** Required: icon-only buttons need an accessible name. */
  "aria-label": string;
}

export function IconButton({ variant = "ghost", ...props }: IconButtonProps) {
  return <Button variant={variant} size="icon" {...props} />;
}
