"use client";

import {
  Badge,
  cn,
  Panel,
  PanelBody,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@gitdojo/ui";
import { GitBranch, GitCommitHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import { useRepositoryStore } from "../state/use-repository-store";

// React Flow measures the DOM, so the graph renders on the client only.
const RepositoryGraph = dynamic(
  () => import("./RepositoryGraph").then((module) => module.RepositoryGraph),
  { ssr: false },
);

export function RepositoryGraphPanel({ className }: { className?: string }) {
  const count = useRepositoryStore((state) => state.repositoryState.allCommits.length);
  const branch = useRepositoryStore((state) => state.repositoryState.currentBranch);

  return (
    <Panel aria-label="Repository graph" className={cn(className)}>
      <PanelHeader>
        <div className="min-w-0">
          <PanelTitle>
            <GitCommitHorizontal aria-hidden="true" />
            Repository Graph
          </PanelTitle>
          <PanelDescription>Click a commit to inspect it</PanelDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {branch ? (
            <Badge
              tone="branch"
              mono
              data-testid="current-branch"
              aria-label={`On branch ${branch}`}
            >
              <GitBranch aria-hidden="true" />
              {branch}
            </Badge>
          ) : null}
          <Badge tone="neutral">
            {count} commit{count === 1 ? "" : "s"}
          </Badge>
        </div>
      </PanelHeader>
      <PanelBody className="p-0">
        <RepositoryGraph />
      </PanelBody>
    </Panel>
  );
}
