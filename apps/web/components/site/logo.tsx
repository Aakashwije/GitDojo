import { cn } from "@gitdojo/ui";

/** Abstract "G" drawn as a commit path: an arc of history ending in two commit nodes. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-6", className)} aria-hidden="true" fill="none">
      <path
        d="M23.07 8.93A10 10 0 1 0 26 16h-8"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="23.07"
        cy="8.93"
        r="3"
        fill="var(--accent-primary)"
        stroke="var(--bg-app)"
        strokeWidth={1.5}
      />
      <circle
        cx="17"
        cy="16"
        r="3"
        fill="var(--accent-primary)"
        stroke="var(--bg-app)"
        strokeWidth={1.5}
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-fg", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">GitDojo</span>
    </span>
  );
}
