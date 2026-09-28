import { Fragment, type ReactNode } from "react";

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*)/g;

/** Renders the small Markdown subset lesson authors use: `code` and **bold**. */
export function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={index} className="gd-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

const LIST_ITEM = /^\s*- /;

/** A paragraph whose every line starts with `- ` is a bullet list. */
function isList(lines: string[]): boolean {
  return lines.length > 0 && lines.every((line) => LIST_ITEM.test(line));
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").filter((line) => line.trim() !== ""));
  return (
    <div className={className}>
      {blocks.map((lines, index) =>
        isList(lines) ? (
          <ul key={index} className="mt-3 list-disc space-y-1 pl-5 marker:text-fg-faint first:mt-0">
            {lines.map((line, item) => (
              <li key={item}>{renderInline(line.replace(LIST_ITEM, ""))}</li>
            ))}
          </ul>
        ) : (
          <p key={index} className="mt-3 first:mt-0">
            {renderInline(lines.map((line) => line.trim()).join(" "))}
          </p>
        ),
      )}
    </div>
  );
}
