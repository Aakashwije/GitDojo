"use client";

import { type Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useImperativeHandle, useRef, type Ref, type RefObject } from "react";
import { TERMINAL_THEME } from "../services/ansi";
import { TerminalController } from "../services/terminal-controller";
import { type TerminalExecutor } from "../services/terminal-executor";
import { useTerminalStore } from "../state/use-terminal-store";

export interface TerminalHandle {
  focus(): void;
  clear(): void;
  restart(banner?: string): void;
  /** Visible buffer contents as plain text. */
  readText(): string;
}

export interface UseTerminalOptions {
  executor: TerminalExecutor;
  /** The terminal accepts input only once the workspace is ready. */
  ready: boolean;
  banner?: string;
  handleRef?: Ref<TerminalHandle>;
}

const FONT_FAMILY = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';

async function waitForFont(): Promise<void> {
  try {
    await document.fonts.load(`13px ${FONT_FAMILY}`);
  } catch (error) {
    // xterm measures glyphs on open; falling back to a system font is acceptable.
    console.warn("[gitdojo] terminal font failed to load", error);
  }
}

/** Mounts xterm.js into a container and connects it to a {@link TerminalController}. */
export function useTerminal({
  executor,
  ready,
  banner,
  handleRef,
}: UseTerminalOptions): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<TerminalController | null>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const executorRef = useRef(executor);
  const startedRef = useRef(false);
  const bannerRef = useRef(banner);
  const readyRef = useRef(ready);

  // Prints the banner and first prompt once both the terminal and the workspace are ready.
  const startIfReady = () => {
    if (startedRef.current || !readyRef.current || !controllerRef.current) return;
    startedRef.current = true;
    controllerRef.current.start(bannerRef.current);
  };

  useEffect(() => {
    executorRef.current = executor;
    bannerRef.current = banner;
    readyRef.current = ready;
    startIfReady();
  });

  useEffect(() => {
    // An object, not a boolean, so TypeScript does not narrow it across the `await` below.
    const lifecycle = { disposed: false };
    let teardown: (() => void) | undefined;

    void (async () => {
      // xterm touches `window` at import time, so it is loaded only in the browser.
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        waitForFont(),
      ]);
      const container = containerRef.current;
      if (lifecycle.disposed || !container) return;

      const terminal = new Terminal({
        fontFamily: FONT_FAMILY,
        fontSize: 13,
        lineHeight: 1.35,
        cursorBlink: true,
        cursorStyle: "block",
        convertEol: false,
        scrollback: 2000,
        theme: TERMINAL_THEME,
        allowTransparency: false,
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(container);
      terminal.textarea?.setAttribute(
        "aria-label",
        "Git terminal. Type a Git command and press Enter.",
      );

      const safeFit = () => {
        // Hidden panels (mobile tabs) report zero size; fitting then would collapse the grid.
        if (container.clientWidth > 0 && container.clientHeight > 0) fit.fit();
      };
      safeFit();
      const observer = new ResizeObserver(safeFit);
      observer.observe(container);

      const store = useTerminalStore.getState();
      const controller = new TerminalController(
        {
          write: (data) => {
            terminal.write(data);
          },
          clear: () => {
            terminal.clear();
          },
          get cols() {
            return terminal.cols;
          },
        },
        {
          executor: (input) => executorRef.current(input),
          getHistory: () => useTerminalStore.getState().history,
          pushHistory: store.pushHistory,
          onTranscript: store.announce,
        },
      );
      const subscription = terminal.onData((data) => {
        void controller.handleData(data);
      });

      terminalRef.current = terminal;
      controllerRef.current = controller;
      teardown = () => {
        subscription.dispose();
        observer.disconnect();
        terminal.dispose();
        terminalRef.current = null;
        controllerRef.current = null;
        startedRef.current = false;
      };
      startIfReady();
    })();

    return () => {
      lifecycle.disposed = true;
      teardown?.();
    };
    // The terminal is created once; changing props flow through refs.
  }, []);

  useImperativeHandle(handleRef, () => ({
    focus: () => terminalRef.current?.focus(),
    clear: () => controllerRef.current?.clearScreen(),
    restart: (nextBanner) => controllerRef.current?.restart(nextBanner ?? bannerRef.current),
    readText: () => {
      const terminal = terminalRef.current;
      if (!terminal) return "";
      const buffer = terminal.buffer.active;
      const lines: string[] = [];
      for (let index = 0; index < buffer.length; index += 1) {
        lines.push(buffer.getLine(index)?.translateToString(true) ?? "");
      }
      return lines.join("\n").trimEnd();
    },
  }));

  return containerRef;
}
