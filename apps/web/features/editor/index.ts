// The editor feature's public API. Other features import only from here ("@/features/editor").

export { EditorPanel } from "./components/EditorPanel";
export { EditorView } from "./components/EditorView";
export { type WorkspaceFileActions } from "./services/editor-controller";
export { isDirty, useEditorStore, type WorkbenchView } from "./state/use-editor-store";
