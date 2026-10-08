// The workspace feature's public API. Other features import only from here ("@/features/workspace").

export { HelpDialog } from "./components/HelpDialog";
export { type MobileTab, MobileTabs } from "./components/MobileTabs";
export { ResetLessonButton } from "./components/ResetLessonDialog";
export { WorkspaceError } from "./components/WorkspaceError";
export { WorkspaceFilePanels } from "./components/WorkspaceFilePanels";
export { useLearningSession } from "./hooks/use-learning-session";
export { createBrowserLessonEnvironment } from "./services/browser-environment";
export { WorkspaceSession } from "./services/workspace-session";
