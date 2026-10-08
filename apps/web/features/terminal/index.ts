// The terminal feature's public API. Other features import only from here ("@/features/terminal").

export { Terminal } from "./components/Terminal";
export { TerminalActions, TerminalPanel } from "./components/TerminalPanel";
export { type TerminalHandle } from "./hooks/use-terminal";
export { createTerminalExecutor, type TerminalExecutor } from "./services/terminal-executor";
