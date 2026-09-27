import { type FileStatus, type StagedChange } from "@gitdojo/shared-types";
import { Badge, type BadgeProps } from "@gitdojo/ui";
import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleMinus,
  GitCommitHorizontal,
  EyeOff,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

const STATUS: Record<FileStatus, { label: string; tone: BadgeProps["tone"]; icon: LucideIcon }> = {
  untracked: { label: "Untracked", tone: "neutral", icon: CircleDashed },
  modified: { label: "Modified", tone: "warning", icon: CircleDot },
  staged: { label: "Staged", tone: "success", icon: CircleCheck },
  committed: { label: "Committed", tone: "accent", icon: GitCommitHorizontal },
  deleted: { label: "Deleted", tone: "danger", icon: CircleMinus },
  ignored: { label: "Ignored", tone: "neutral", icon: EyeOff },
  conflicted: { label: "Conflict", tone: "danger", icon: TriangleAlert },
};

const CHANGE_LABELS: Record<StagedChange, string> = {
  added: "New file",
  modified: "Modified",
  deleted: "Deleted",
};

/** Status chip with icon + text, so status never relies on color alone. */
export function GitStatusBadge({ status, change }: { status: FileStatus; change?: StagedChange }) {
  const { label, tone, icon: Icon } = STATUS[status];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden="true" />
      {change ? `${label} · ${CHANGE_LABELS[change]}` : label}
    </Badge>
  );
}
