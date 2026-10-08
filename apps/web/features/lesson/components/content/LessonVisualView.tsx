import { type LessonVisual } from "@gitdojo/shared-types";
import { DemoAreasView } from "./DemoAreasView";
import { DemoGraphView } from "./DemoGraphView";

export function AsciiDiagram({ text }: { text: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border-subtle bg-editor p-3 font-mono text-caption leading-relaxed text-fg-secondary">
      {text.replace(/\n$/, "")}
    </pre>
  );
}

/** Renders whichever visual a diagram or demo step carries. */
export function LessonVisualView({ visual }: { visual: LessonVisual }) {
  if (visual.graph) {
    return (
      <div className="overflow-x-auto rounded-md border border-border-subtle bg-editor px-3 py-2">
        <DemoGraphView graph={visual.graph} />
      </div>
    );
  }
  if (visual.areas) return <DemoAreasView areas={visual.areas} />;
  if (visual.ascii !== undefined) return <AsciiDiagram text={visual.ascii} />;
  return null;
}
