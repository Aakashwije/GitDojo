"use client";

import {
  cn,
  IconButton,
  Panel,
  PanelActions,
  PanelDescription,
  PanelHeader,
  PanelTitle,
  Tooltip,
} from "@gitdojo/ui";
import { Check, Copy, Eraser, SquareTerminal } from "lucide-react";
import { useState, type RefObject } from "react";
import { type TerminalHandle } from "../hooks/use-terminal";
import { type TerminalExecutor } from "../services/terminal-executor";
import { Terminal } from "./Terminal";

export interface TerminalPanelProps {
  executor: TerminalExecutor;
  ready: boolean;
  banner?: string;
  handleRef: RefObject<TerminalHandle | null>;
  className?: string;
}

export function TerminalPanel({
  executor,
  ready,
  banner,
  handleRef,
  className,
}: TerminalPanelProps) {
  const [copied, setCopied] = useState(false);

  const copyOutput = async () => {
    const text = handleRef.current?.readText() ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (error) {
      console.warn("[gitdojo] could not copy terminal output", error);
    }
  };

  return (
    <Panel aria-label="Terminal" className={cn("border-border-subtle", className)}>
      <PanelHeader className="bg-panel">
        <div className="min-w-0">
          <PanelTitle>
            <SquareTerminal aria-hidden="true" />
            Terminal
          </PanelTitle>
          <PanelDescription className="truncate">
            Git sandbox · Safe browser environment
          </PanelDescription>
        </div>
        <PanelActions>
          <Tooltip content={copied ? "Copied" : "Copy output"}>
            <IconButton aria-label="Copy terminal output" onClick={() => void copyOutput()}>
              {copied ? <Check className="text-success" /> : <Copy />}
            </IconButton>
          </Tooltip>
          <Tooltip content="Clear (Ctrl+L)">
            <IconButton aria-label="Clear terminal" onClick={() => handleRef.current?.clear()}>
              <Eraser />
            </IconButton>
          </Tooltip>
        </PanelActions>
      </PanelHeader>
      <div className="min-h-0 flex-1">
        <Terminal executor={executor} ready={ready} banner={banner} handleRef={handleRef} />
      </div>
    </Panel>
  );
}
