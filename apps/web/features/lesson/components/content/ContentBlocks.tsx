import { type LessonContentBlock } from "@gitdojo/shared-types";
import { cn } from "@gitdojo/ui";
import { Info, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";
import { renderInline, RichText } from "../RichText";

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

export function ExampleBlock({ block }: { block: BlockOf<"example"> }) {
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-md border border-border-subtle bg-terminal font-mono text-caption">
        <p className="overflow-x-auto px-3 pt-2.5 pb-2 whitespace-pre text-fg-terminal">
          <span className="text-success select-none">$ </span>
          {block.command}
        </p>
        {block.output ? (
          <pre
            className="overflow-x-auto border-t border-border-subtle px-3 py-2.5 leading-relaxed text-fg-secondary"
            style={{ tabSize: 8 }}
          >
            {block.output.replace(/\n$/, "")}
          </pre>
        ) : null}
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
          className="rounded-md border border-border-subtle bg-surface p-3"
        >
          <h4 className="text-small font-semibold text-fg">{column.title}</h4>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-small text-fg-secondary marker:text-fg-faint">
            {column.items.map((item) => (
              <li key={item}>{renderInline(item)}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const CALLOUT: Record<
  BlockOf<"callout">["tone"],
  { icon: LucideIcon; className: string; label: string }
> = {
  tip: { icon: Lightbulb, className: "border-warning/25 [&_svg]:text-warning", label: "Tip" },
  note: { icon: Info, className: "border-info/25 [&_svg]:text-info", label: "Note" },
  warning: {
    icon: TriangleAlert,
    className: "border-danger/30 [&_svg]:text-danger",
    label: "Warning",
  },
};

export function CalloutBlock({ block }: { block: BlockOf<"callout"> }) {
  const { icon: Icon, className, label } = CALLOUT[block.tone];
  return (
    <aside
      aria-label={block.title ?? label}
      className={cn("flex gap-3 rounded-md border bg-elevated/60 p-3", className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-small text-fg-secondary">
        {block.title ? <p className="font-semibold text-fg">{block.title}</p> : null}
        <RichText text={block.body} className={cn(block.title && "mt-1")} />
      </div>
    </aside>
  );
}
