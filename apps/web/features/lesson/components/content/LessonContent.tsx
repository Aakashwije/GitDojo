import { type LessonContentBlock } from "@gitdojo/shared-types";
import { cn } from "@gitdojo/ui";
import { createElement } from "react";
import { renderInline, RichText } from "@/components/content/rich-text";
import { CalloutBlock, ComparisonBlock, ExampleBlock } from "./ContentBlocks";
import { DemoPlayer } from "./DemoPlayer";
import { LessonVisualView } from "./LessonVisualView";

export interface LessonContentProps {
  blocks: readonly LessonContentBlock[];
  /** Heading level for block titles: 2 on a reading page, 3 inside the lesson panel. */
  headingLevel?: 2 | 3;
  className?: string;
}

function BlockBody({ block }: { block: LessonContentBlock }) {
  switch (block.type) {
    case "text":
      return <RichText text={block.body} className="text-body text-fg-secondary" />;
    case "diagram":
      return (
        <figure className="space-y-2">
          <LessonVisualView visual={block} />
          {block.caption ? (
            <figcaption className="text-caption text-fg-muted">
              {renderInline(block.caption)}
            </figcaption>
          ) : null}
        </figure>
      );
    case "example":
      return <ExampleBlock block={block} />;
    case "comparison":
      return <ComparisonBlock block={block} />;
    case "callout":
      return <CalloutBlock block={block} />;
    case "demo":
      return <DemoPlayer title={block.title} steps={block.steps} />;
  }
}

/** Explanations, diagrams, examples and demos authored in a lesson's `content`. */
export function LessonContent({ blocks, headingLevel = 2, className }: LessonContentProps) {
  return (
    <div className={cn("space-y-8", className)}>
      {blocks.map((block, index) => (
        <section key={index} data-block={block.type} className="space-y-3">
          {/* Demos and callouts show their own titles. */}
          {block.title && block.type !== "demo" && block.type !== "callout"
            ? createElement(
                `h${String(headingLevel)}`,
                { className: "text-h4 font-semibold text-fg" },
                block.title,
              )
            : null}
          <BlockBody block={block} />
        </section>
      ))}
    </div>
  );
}
