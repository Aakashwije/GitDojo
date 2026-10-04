"use client";

import { contentKey, type ContentRef } from "@gitdojo/progress";
import { cn } from "@gitdojo/ui";
import { useProgressStore } from "../state/use-progress-store";

/**
 * The XP a completion earned: "+50 XP" the first time, a note on replays (which never earn XP
 * again), and the XP earned when finished content is simply viewed.
 */
export function XpAward({
  content,
  className,
}: {
  content: Pick<ContentRef, "kind" | "id">;
  className?: string;
}) {
  const key = contentKey(content);
  const award = useProgressStore((state) =>
    state.lastAward?.key === key ? state.lastAward : null,
  );
  const earned = useProgressStore((state) => {
    const records =
      content.kind === "lesson"
        ? state.progress?.completedLessons
        : state.progress?.completedChallenges;
    return records?.[content.id]?.xp ?? null;
  });

  if (award && award.xp > 0) {
    return (
      <p data-testid="xp-award" className={cn("font-mono font-semibold text-success", className)}>
        +{award.xp} XP
      </p>
    );
  }
  if (earned === null) return null;
  if (award === null) {
    // Viewing finished content, not replaying it.
    return (
      <p data-testid="xp-award" className={cn("font-mono text-fg-muted", className)}>
        {earned} XP earned
      </p>
    );
  }
  return (
    <p data-testid="xp-award" className={cn("text-small text-fg-muted", className)}>
      Already completed: no new XP <span className="font-mono">({earned} XP earned before)</span>
    </p>
  );
}
