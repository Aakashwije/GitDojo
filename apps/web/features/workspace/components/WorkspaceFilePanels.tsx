"use client";

import { useConflictEditorStore } from "@/features/conflicts";
import { useEditorStore } from "@/features/editor";
import { RepositoryPanel, StagingAreaPanel, WorkingTreePanel } from "@/features/repository";

const PANEL = "max-md:min-h-40 md:h-[240px] lg:h-auto";

/**
 * The working tree, staging area and repository panels, wired to the editor and the conflict
 * editor. The repository feature only shows files; this shell decides what opening one does.
 */
export function WorkspaceFilePanels() {
  const openFile = useEditorStore((state) => state.openFile);
  const resolveConflict = useConflictEditorStore((state) => state.open);
  return (
    <>
      <WorkingTreePanel
        className={PANEL}
        onOpenFile={openFile}
        onResolveConflict={resolveConflict}
      />
      <StagingAreaPanel className={PANEL} onOpenFile={openFile} />
      <RepositoryPanel className={PANEL} />
    </>
  );
}
