import { type ContentRef } from "@gitdojo/progress";
import { type LessonDefinition } from "@gitdojo/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@gitdojo/ui";
import { ArrowRight, Trophy } from "lucide-react";
import Link from "next/link";
import { XpAward } from "@/features/progress";
import { HintSummary } from "./CompletionCard";

export interface LessonCompleteDialogProps {
  lesson: LessonDefinition;
  /** What the completion counts as in progress. */
  content: Pick<ContentRef, "kind" | "id">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPracticeAgain: () => void;
  /** Where to go next: the next lesson, or back to the course after the last one. */
  next?: { href: string; label: string };
  title?: string;
}

export function LessonCompleteDialog({
  lesson,
  content,
  open,
  onOpenChange,
  onPracticeAgain,
  next = { href: "/", label: "Back to home" },
  title = "Lesson Complete",
}: LessonCompleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="shadow-[0_0_80px_-20px_rgb(79_209_139/0.35)]">
        <div className="flex size-10 items-center justify-center rounded-lg border border-success/30 bg-success-soft">
          <Trophy className="size-5 text-success" aria-hidden="true" />
        </div>
        <DialogTitle className="mt-4">{title}</DialogTitle>
        <DialogDescription>{lesson.title}</DialogDescription>

        {lesson.commands && lesson.commands.length > 0 ? (
          <div className="mt-5">
            <p className="text-micro font-semibold tracking-wider text-fg-muted uppercase">
              You practiced
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {lesson.commands.map((command) => (
                <li
                  key={command}
                  className="rounded-sm border border-border-strong bg-elevated px-2 py-0.5 font-mono text-caption text-fg"
                >
                  {command}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <XpAward content={content} className="mt-5 text-h4" />
        <HintSummary className="mt-1 text-small text-fg-muted" />

        <DialogFooter>
          <Button variant="secondary" onClick={onPracticeAgain}>
            Practice again
          </Button>
          <Button variant="primary" asChild>
            <Link href={next.href} data-testid="complete-next">
              {next.label} <ArrowRight />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
