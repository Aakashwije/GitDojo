// The workspace feature's public API. Other features import only from here ("@/features/workspace").

export { GitEditorDialog } from "./components/GitEditorDialog";
export { HelpDialog } from "./components/HelpDialog";
export { type MobileTab, MobileTabs } from "./components/MobileTabs";
export { ResetLessonButton } from "./components/ResetLessonDialog";
export { WorkspaceError } from "./components/WorkspaceError";
export { WorkspaceFilePanels } from "./components/WorkspaceFilePanels";
export { useLearningSession } from "./hooks/use-learning-session";
export { usePracticeSession, type PracticeSessionControls } from "./hooks/use-practice-session";
export { createBrowserLessonEnvironment } from "./services/browser-environment";
export { settleEditor } from "./services/git-editor";
export { WorkspaceSession } from "./services/workspace-session";
export { WorkbenchPanel } from "./components/WorkbenchPanel";
export {
  PracticeSession,
  workspaceIdForPractice,
  type PracticeSnapshot,
} from "./services/practice-session";
export { useGitEditorStore } from "./state/use-git-editor-store";
