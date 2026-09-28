import { type LessonType } from "@gitdojo/shared-types";
import { Badge } from "@gitdojo/ui";
import { BookOpen, Flag, SquareTerminal, type LucideIcon } from "lucide-react";

const TYPES: Record<
  LessonType,
  { label: string; icon: LucideIcon; tone: "neutral" | "accent" | "warning" }
> = {
  concept: { label: "Concept", icon: BookOpen, tone: "neutral" },
  interactive: { label: "Hands-on", icon: SquareTerminal, tone: "accent" },
  challenge: { label: "Challenge", icon: Flag, tone: "warning" },
};

export function LessonTypeBadge({ type }: { type: LessonType }) {
  const { label, icon: Icon, tone } = TYPES[type];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
