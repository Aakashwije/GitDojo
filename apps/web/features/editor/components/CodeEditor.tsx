"use client";

import Editor, { loader } from "@monaco-editor/react";
import type * as MonacoApi from "monaco-editor";
import { useEffect, useRef } from "react";

// Monaco is served from GitDojo itself (copied to public/monaco at build time), never a CDN.
loader.config({ paths: { vs: "/monaco/vs" } });

const THEME = "gitdojo-dark";

/** Monaco colors taken from the GitDojo design tokens (see packages/ui/src/styles/theme.css). */
function defineTheme(monaco: typeof MonacoApi): void {
  monaco.editor.defineTheme(THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7C8593", fontStyle: "italic" },
      { token: "keyword", foreground: "A78BFA" },
      { token: "string", foreground: "4FD18B" },
      { token: "number", foreground: "F59E5B" },
      { token: "type", foreground: "62B6FF" },
      { token: "delimiter", foreground: "AEB6C2" },
    ],
    colors: {
      "editor.background": "#0D1014",
      "editor.foreground": "#F4F7FB",
      "editorLineNumber.foreground": "#49515C",
      "editorLineNumber.activeForeground": "#AEB6C2",
      "editor.lineHighlightBackground": "#151920",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#6C8CFF40",
      "editor.inactiveSelectionBackground": "#6C8CFF20",
      "editorCursor.foreground": "#6C8CFF",
      "editorIndentGuide.background1": "#1D222A",
      "editorWhitespace.foreground": "#343C48",
      "editorWidget.background": "#1A1F27",
      "editorWidget.border": "#262C35",
      "scrollbarSlider.background": "#343C4880",
      "scrollbarSlider.hoverBackground": "#5F6875A0",
      focusBorder: "#6C8CFF",
    },
  });
}

export interface CodeEditorProps {
  /** Unique per workspace and file, so each file keeps its own undo history. */
  modelPath: string;
  value: string;
  language: string;
  readOnly: boolean;
  label: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onBlur: () => void;
}

/** Monaco, configured for learning: line numbers and highlighting, no minimap or IntelliSense noise. */
export function CodeEditor({
  modelPath,
  value,
  language,
  readOnly,
  label,
  onChange,
  onSave,
  onBlur,
}: CodeEditorProps) {
  const handlers = useRef({ onSave, onBlur });
  useEffect(() => {
    handlers.current = { onSave, onBlur };
  });

  const handleMount = (
    editor: MonacoApi.editor.IStandaloneCodeEditor,
    monaco: typeof MonacoApi,
  ) => {
    // Ctrl/Cmd+S saves at once instead of opening the browser's "Save page" dialog.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handlers.current.onSave();
    });
    editor.onDidBlurEditorText(() => {
      handlers.current.onBlur();
    });
  };

  return (
    <Editor
      path={modelPath}
      value={value}
      language={language}
      theme={THEME}
      beforeMount={defineTheme}
      onMount={handleMount}
      onChange={(next) => {
        onChange(next ?? "");
      }}
      loading={<p className="text-caption text-fg-muted">Loading editor…</p>}
      wrapperProps={{ "data-testid": "code-editor", "aria-label": label }}
      options={{
        readOnly,
        readOnlyMessage: { value: "This lesson's files are read-only." },
        fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace',
        fontSize: 13,
        lineHeight: 20,
        lineNumbers: "on",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderLineHighlight: "line",
        tabSize: 2,
        padding: { top: 10, bottom: 10 },
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        parameterHints: { enabled: false },
        hover: { enabled: "off" },
        occurrencesHighlight: "off",
        contextmenu: false,
        stickyScroll: { enabled: false },
        automaticLayout: true,
        ariaLabel: label,
      }}
    />
  );
}
