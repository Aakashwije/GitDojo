import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-24 flex-col items-center justify-center gap-1.5 px-4 py-4 text-center">
      <Icon className="size-[18px] text-fg-faint" aria-hidden="true" />
      <p className="text-small font-medium text-fg-secondary">{title}</p>
      {children ? <p className="max-w-64 text-caption text-fg-muted">{children}</p> : null}
    </div>
  );
}
