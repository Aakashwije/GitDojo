import { type LessonContentBlock } from "@gitdojo/shared-types";
import { cn } from "@gitdojo/ui";
import { Info, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";
import { Fragment } from "react";
import { renderInline, RichText } from "@/components/content/rich-text";

type BlockOf<T extends LessonContentBlock["type"]> = Extract<LessonContentBlock, { type: T }>;

/** A command as it would be typed in the terminal. */
export function CommandLine({ command }: { command: string }) {
  return (
    <p className="overflow-x-auto rounded-md border border-border-subtle bg-terminal px-3 py-2 font-mono text-caption whitespace-pre text-fg-terminal">
      <span className="text-success select-none">$ </span>
      {command}
    </p>
  );
}

/**
 * Colour for one line of command output. Diffs are the output learners read most, so added and
 * removed lines are told apart at a glance; everything else keeps the terminal's own colour.
 */
function outputLineClass(line: string): string {
  if (/^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity|rename )/.test(line)) {
    return "text-fg-muted";
  }
  if (line.startsWith("@@")) return "text-info";
  if (line.startsWith("+")) return "text-success";
  if (line.startsWith("-")) return "text-danger";
  return "";
}

/** Command output, one line per span so diff lines can be coloured. */
function CommandOutput({ output }: { output: string }) {
  const lines = output.replace(/\n$/, "").split("\n");
  return (
    <pre
      className="overflow-x-auto border-t border-border-subtle px-3 py-2.5 leading-relaxed text-fg-secondary"
      style={{ tabSize: 8 }}
    >
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 ? "\n" : null}
          <span className={outputLineClass(line)}>{line}</span>
        </Fragment>
      ))}
    </pre>
  );
}

export function ExampleBlock({ block }: { block: BlockOf<"example"> }) {
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-md border border-border-subtle bg-terminal font-mono text-caption">
        <p className="overflow-x-auto px-3 pt-2.5 pb-2 whitespace-pre text-fg-terminal">
          <span className="text-success select-none">$ </span>
          {block.command}
        </p>
        {block.output ? <CommandOutput output={block.output} /> : null}
      </div>
      {block.explanation ? (
        <RichText text={block.explanation} className="text-small text-fg-secondary" />
      ) : null}
    </div>
  );
}

export function ComparisonBlock({ block }: { block: BlockOf<"comparison"> }) {
  return (
    <div
      className={cn("grid gap-2", block.columns.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}
    >
      {block.columns.map((column) => (
        <section
          key={column.title}
          aria-label={column.title}
          className="flex min-w-0 flex-col overflow-hidden rounded-md border border-border-subtle bg-surface"
        >
          <h4 className="border-b border-border-subtle bg-panel px-3 py-2 text-small font-semibold text-fg">
            {column.title}
          </h4>
          <ul className="flex-1 space-y-2 px-3 py-2.5 text-small text-fg-secondary">
            {column.items.map((item) => (
              <li key={item} className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-fg-faint"
                />
                <span className="min-w-0">{renderInline(item)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const CALLOUT: Record<
  BlockOf<"callout">["tone"],
  { icon: LucideIcon; className: string; label: string; labelClassName: string }
> = {
  tip: {
    icon: Lightbulb,
    className: "border-warning/25 bg-warning-soft [&_svg]:text-warning",
    label: "Tip",
    labelClassName: "text-warning",
  },
  note: {
    icon: Info,
    className: "border-info/25 bg-info/10 [&_svg]:text-info",
    label: "Note",
    labelClassName: "text-info",
  },
  warning: {
    icon: TriangleAlert,
    className: "border-danger/30 bg-danger-soft [&_svg]:text-danger",
    label: "Warning",
    labelClassName: "text-danger",
  },
};

export function CalloutBlock({ block }: { block: BlockOf<"callout"> }) {
  const { icon: Icon, className, label, labelClassName } = CALLOUT[block.tone];
  return (
    <aside
      aria-label={block.title ?? label}
      className={cn("flex gap-3 rounded-md border p-3", className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-small text-fg-secondary">
        {/* The tone is named in text, never carried by colour alone. */}
        <p
          className={cn(
            "text-micro font-semibold tracking-wider uppercase",
            labelClassName,
            block.title && "text-fg-muted",
          )}
        >
          {label}
        </p>
        {block.title ? <p className="mt-0.5 font-semibold text-fg">{block.title}</p> : null}
        <RichText text={block.body} className="mt-1" />
      </div>
    </aside>
  );
}
