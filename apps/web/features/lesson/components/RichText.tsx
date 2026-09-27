import { Fragment, type ReactNode } from "react";

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*)/g;

/** Renders the small Markdown subset lesson authors use: paragraphs, `code` and **bold**. */
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

export function RichText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " "));
  return (
    <div className={className}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="mt-3 first:mt-0">
          {renderInline(paragraph)}
        </p>
      ))}
    </div>
  );
}
