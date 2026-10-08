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

export interface ContentSection {
  /** Anchor on the rendered section, so a lesson's own headings can be linked to. */
  id: string;
  title: string;
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

/** Callouts are asides rather than sections, and untitled blocks have nothing to link to. */
function isSection(block: LessonContentBlock): boolean {
  return block.title !== undefined && block.type !== "callout";
}

/** One anchor per block, in order; `undefined` where the block is not a linkable section. */
function anchors(blocks: readonly LessonContentBlock[]): (string | undefined)[] {
  const used = new Map<string, number>();
  return blocks.map((block) => {
    if (!isSection(block) || block.title === undefined) return undefined;
    const base = slugify(block.title);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${String(seen + 1)}`;
  });
}

/**
 * The lesson's own headings, in order, with a unique anchor each. Derived from the authored block
 * titles, so a reading page can offer "In this lesson" without any extra YAML.
 */
export function contentSections(blocks: readonly LessonContentBlock[]): ContentSection[] {
  const ids = anchors(blocks);
  return blocks.flatMap((block, index) => {
    const id = ids[index];
    return id !== undefined && block.title !== undefined ? [{ id, title: block.title }] : [];
  });
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
  const ids = anchors(blocks);

  return (
    <div className={cn("space-y-8", className)}>
      {blocks.map((block, index) => {
        const id = ids[index];
        return (
          <section
            key={index}
            data-block={block.type}
            className={cn("space-y-3", id !== undefined && "scroll-mt-20")}
            {...(id === undefined ? {} : { id })}
          >
            {/* Demos and callouts show their own titles. */}
            {block.title && block.type !== "demo" && block.type !== "callout"
              ? createElement(
                  `h${String(headingLevel)}`,
                  {
                    className: cn(
                      "font-semibold text-fg",
                      headingLevel === 2 ? "text-h4 sm:text-h3" : "text-h4",
                    ),
                  },
                  block.title,
                )
              : null}
            <BlockBody block={block} />
          </section>
        );
      })}
    </div>
  );
}
