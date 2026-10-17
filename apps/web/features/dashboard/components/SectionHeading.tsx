import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

export function SectionHeading({
  id,
  icon: Icon,
  children,
}: {
  id: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-body font-semibold text-fg">
      <Icon className="size-4 text-fg-muted" aria-hidden="true" />
      {children}
    </h2>
  );
}
