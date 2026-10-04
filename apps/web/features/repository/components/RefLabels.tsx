import { Badge, cn, Tooltip } from "@gitdojo/ui";
import { ArrowRight, GitBranch } from "lucide-react";

export const HEAD_EXPLANATION =
  "HEAD points to the branch you are on, and so to the commit your files are based on.";

export interface RefLabelsProps {
  /** Branches pointing at this commit. */
  branches: readonly string[];
  /** HEAD points at this commit. */
  isHead: boolean;
  /** HEAD's branch, when HEAD is attached to one. */
  currentBranch: string | null;
  /** Explain HEAD in a tooltip (off inside static illustrations). */
  withTooltip?: boolean;
  className?: string;
}

/**
 * Branch and HEAD labels for a commit. HEAD is a solid blue chip and sits in front of the branch
 * it points to (`HEAD → main`), so it never reads as just another branch.
 */
export function RefLabels({
  branches,
  isHead,
  currentBranch,
  withTooltip = true,
  className,
}: RefLabelsProps) {
  if (branches.length === 0 && !isHead) return null;
  const attachedTo =
    isHead && currentBranch !== null && branches.includes(currentBranch) ? currentBranch : null;
  const others = branches.filter((branch) => branch !== attachedTo);

  const head = (
    <Badge
      tone="accent"
      data-testid="head-label"
      className="border-accent-strong bg-accent-strong text-white"
    >
      HEAD
    </Badge>
  );

  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {isHead ? (
        <span className="inline-flex items-center gap-1">
          {withTooltip ? (
            <Tooltip content={HEAD_EXPLANATION}>
              <span tabIndex={0} className="nopan inline-flex rounded-sm">
                {head}
              </span>
            </Tooltip>
          ) : (
            head
          )}
          {attachedTo !== null ? (
            <>
              <ArrowRight className="size-3 text-accent" aria-label="points to" />
              <BranchLabel name={attachedTo} current />
            </>
          ) : null}
        </span>
      ) : null}
      {others.map((branch) => (
        <BranchLabel key={branch} name={branch} current={false} />
      ))}
    </span>
  );
}

function BranchLabel({ name, current }: { name: string; current: boolean }) {
  return (
    <Badge
      tone="branch"
      mono
      data-testid="branch-label"
      data-branch={name}
      data-current={current || undefined}
      className={cn(current && "ring-1 ring-branch/60")}
    >
      <GitBranch aria-hidden="true" />
      {name}
    </Badge>
  );
}
