import { Fragment } from "react";

/**
 * The Markdown a highlight may use: `code` (Git commands) and **bold**. Everything else is plain
 * text; links and HTML are refused when the release is published.
 */
export function InlineText({ text }: { text: string }) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded-sm border border-border-subtle bg-elevated px-1 py-px font-mono text-[0.9em] text-fg"
        >
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
