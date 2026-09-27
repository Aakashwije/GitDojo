import { Badge, cn } from "@gitdojo/ui";
import { ArrowRight, CircleCheck, CircleDashed, GitBranch } from "lucide-react";
import { type CSSProperties, type ReactNode } from "react";

/** Delays the entrance animation so the mock "plays back" once on load. */
function step(index: number): CSSProperties {
  return { animationDelay: `${String(150 + index * 350)}ms` };
}

function Prompt({ children, index }: { children: ReactNode; index: number }) {
  return (
    <p className="animate-gd-enter" style={step(index)}>
      <span className="text-success">learner@gitdojo</span>{" "}
      <span className="text-info">~/project</span> <span className="text-fg-muted">$</span>{" "}
      <span className="text-fg">{children}</span>
    </p>
  );
}

function MiniPanel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 flex-1 rounded-md border border-border bg-panel p-3", className)}>
      <p className="mb-2 text-micro font-semibold tracking-wider text-fg-muted uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

/** Static illustration of the learning loop: type a command, see the repository change. */
export function HeroDemo() {
  return (
    <div
      className="relative rounded-xl border border-border bg-surface p-3 shadow-2xl shadow-black/40"
      aria-label="Example: staging and committing README.md"
      role="img"
    >
      <div className="rounded-lg border border-border-subtle bg-terminal">
        <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
          <span className="text-caption font-medium text-fg-secondary">Terminal</span>
          <span className="text-micro text-fg-faint">Safe browser environment</span>
        </div>
        <div className="space-y-1 px-3 py-3 font-mono text-[12.5px] leading-5 text-fg-terminal">
          <Prompt index={0}>git status</Prompt>
          <div className="animate-gd-enter text-fg-secondary" style={step(1)}>
            <p>On branch main</p>
            <p>Untracked files:</p>
            <p className="pl-6 text-danger">README.md</p>
          </div>
          <Prompt index={2}>git add README.md</Prompt>
          <Prompt index={3}>git commit -m &quot;Initial commit&quot;</Prompt>
          <p className="animate-gd-enter text-fg-secondary" style={step(4)}>
            [main (root-commit) <span className="text-warning">1f9d220</span>] Initial commit
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-stretch gap-2">
        <MiniPanel title="Working tree">
          <p className="flex items-center gap-1.5 font-mono text-caption text-fg-muted line-through decoration-fg-faint">
            <CircleDashed className="size-3.5" aria-hidden="true" /> README.md
          </p>
        </MiniPanel>
        <ArrowRight
          className="size-4 shrink-0 animate-gd-pulse-x self-center text-accent"
          aria-hidden="true"
        />
        <MiniPanel title="Staging area">
          <p
            className="flex animate-gd-move-in items-center gap-1.5 font-mono text-caption text-success"
            style={step(2)}
          >
            <CircleCheck className="size-3.5" aria-hidden="true" /> README.md
          </p>
        </MiniPanel>
        <ArrowRight
          className="size-4 shrink-0 animate-gd-pulse-x self-center text-accent"
          aria-hidden="true"
        />
        <MiniPanel title="Repository" className="hidden sm:block">
          <div className="animate-gd-pop" style={step(4)}>
            <Badge tone="branch" mono className="mb-1.5">
              <GitBranch /> main
            </Badge>
            <p className="flex items-center gap-1.5 text-caption text-fg">
              <span className="size-2.5 shrink-0 rounded-full bg-accent ring-2 ring-accent-soft" />
              <span className="truncate">Initial commit</span>
            </p>
          </div>
        </MiniPanel>
      </div>
    </div>
  );
}
