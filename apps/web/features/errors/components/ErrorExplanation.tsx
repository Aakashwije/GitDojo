"use client";

import { Button, cn, IconButton } from "@gitdojo/ui";
import { ArrowUpRight, ChevronDown, CircleHelp, Info, X } from "lucide-react";
import Link from "next/link";
import { lessonHref } from "@/features/course";
import { renderInline } from "@/components/content/rich-text";
import { useExplanationStore } from "../state/use-explanation-store";

/**
 * "Why did this happen?" for the last command. The terminal keeps Git's real message; this panel
 * adds the explanation, likely causes (with the learner's own files and branches) and hints.
 */
export function ErrorExplanation({
  spoilerFree = false,
  className,
}: {
  /**
   * Challenges: explain what happened, but leave out suggestions and lesson links that would
   * name the solution; the challenge's own hints point the way instead.
   */
  spoilerFree?: boolean;
  className?: string;
}) {
  const explanation = useExplanationStore((state) => state.explanation);
  const expanded = useExplanationStore((state) => state.expanded);
  const toggle = useExplanationStore((state) => state.toggle);
  const dismiss = useExplanationStore((state) => state.dismiss);
  if (!explanation) return null;

  const notice = explanation.severity === "notice";
  const Icon = notice ? Info : CircleHelp;

  return (
    <section
      aria-label="Explanation"
      data-testid="error-explanation"
      data-code={explanation.code}
      className={cn(
        "shrink-0 animate-gd-enter border-t px-3 py-2",
        notice ? "border-info/30 bg-info/5" : "border-warning/30 bg-warning-soft",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn("size-4 shrink-0", notice ? "text-info" : "text-warning")}
          aria-hidden="true"
        />
        <p className="min-w-0 flex-1 truncate text-small font-medium text-fg">
          {explanation.title}
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          aria-expanded={expanded}
          aria-controls="error-explanation-details"
          onClick={toggle}
        >
          {notice ? "What does this mean?" : "Why did this happen?"}
          <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
        </Button>
        <IconButton aria-label="Dismiss explanation" className="size-7" onClick={dismiss}>
          <X />
        </IconButton>
      </div>
      {expanded ? (
        <div
          id="error-explanation-details"
          className="mt-2 max-h-56 space-y-3 overflow-auto pb-1 text-small text-fg-secondary"
        >
          <p>{renderInline(explanation.explanation)}</p>
          {explanation.possibleCauses ? (
            <div>
              <h3 className="text-micro font-semibold tracking-wider text-fg-muted uppercase">
                Likely causes
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {explanation.possibleCauses.map((cause) => (
                  <li key={cause}>{renderInline(cause)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {explanation.hints && !spoilerFree ? (
            <div>
              <h3 className="text-micro font-semibold tracking-wider text-fg-muted uppercase">
                Try
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {explanation.hints.map((hint) => (
                  <li key={hint}>{renderInline(hint)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {spoilerFree ? (
            <p className="text-caption text-fg-muted">
              Suggestions are hidden in challenges. Stuck? The hints in the challenge panel point
              the way without giving it away.
            </p>
          ) : null}
          {explanation.learnMore && !spoilerFree ? (
            <Link
              href={lessonHref(explanation.learnMore.course, explanation.learnMore.lesson)}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-small font-medium text-accent hover:underline"
            >
              Learn more: {explanation.learnMore.title}
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
