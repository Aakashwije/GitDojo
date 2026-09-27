import { Button } from "@gitdojo/ui";
import { TriangleAlert } from "lucide-react";

export function WorkspaceError({
  details,
  onRetry,
}: {
  details: string | null;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-auto mt-24 max-w-md rounded-xl border border-border bg-panel p-6 text-center"
    >
      <TriangleAlert className="mx-auto size-6 text-danger" aria-hidden="true" />
      <p className="mt-3 text-body font-medium text-fg">
        Something went wrong loading this lesson.
      </p>
      <p className="mt-1 text-small text-fg-secondary">
        GitDojo stores lessons in your browser&apos;s IndexedDB. Private browsing modes can block
        it.
      </p>
      <Button variant="primary" className="mt-5" onClick={onRetry}>
        Retry
      </Button>
      {details ? (
        <details className="mt-4 text-left">
          <summary className="cursor-pointer text-caption text-fg-muted">Show details</summary>
          <pre className="mt-2 overflow-auto rounded-md bg-terminal p-3 font-mono text-caption whitespace-pre-wrap text-fg-secondary">
            {details}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
