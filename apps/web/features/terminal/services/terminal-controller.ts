import { ansi, PLAIN_PROMPT, renderPrompt } from "./ansi";
import {
  INITIAL_HISTORY_CURSOR,
  nextEntry,
  previousEntry,
  type HistoryCursor,
} from "./command-history";
import { EMPTY_LINE, interpretInput, type LineState } from "./line-editor";
import { renderInputLine } from "./render-line";
import { type TerminalExecutor } from "./terminal-executor";

/** The minimal surface the controller needs; xterm.js in the app, a fake in tests. */
export interface TerminalSurface {
  write(data: string): void;
  clear(): void;
  readonly cols: number;
}

export interface TerminalControllerOptions {
  executor: TerminalExecutor;
  getHistory: () => readonly string[];
  pushHistory: (line: string) => void;
  /** Called with a plain-text transcript after every command (for screen readers). */
  onTranscript?: (text: string) => void;
}

/**
 * Owns prompt, line editing, history and command dispatch. Commands run one at a time. Like a
 * real terminal's typeahead, input received while a command runs is buffered and replayed once
 * it finishes, so output never interleaves and fast typing is never lost.
 */
export class TerminalController {
  private line: LineState = EMPTY_LINE;
  private cursorOffset = 0;
  private historyCursor: HistoryCursor = INITIAL_HISTORY_CURSOR;
  private busy = false;
  private active = false;
  /** Input typed while a command was running, replayed in order afterwards. */
  private typeahead: string[] = [];

  constructor(
    private readonly surface: TerminalSurface,
    private readonly options: TerminalControllerOptions,
  ) {}

  get isBusy(): boolean {
    return this.busy;
  }

  /** Prints an optional banner and the first prompt. Input is ignored until this is called. */
  start(banner?: string): void {
    if (banner) this.surface.write(`${banner}\r\n\r\n`);
    this.writePrompt();
    this.active = true;
  }

  /** Clears the screen and starts over (used when the lesson is reset). */
  restart(banner?: string): void {
    this.typeahead = [];
    this.surface.clear();
    this.surface.write("\r\x1b[2K");
    this.historyCursor = INITIAL_HISTORY_CURSOR;
    this.start(banner);
  }

  clearScreen(): void {
    this.surface.clear();
    // `clear` keeps the cursor row; redraw the prompt from its first column.
    this.cursorOffset = 0;
    this.redraw(this.line);
  }

  async handleData(data: string): Promise<void> {
    if (!this.active) return;
    if (this.busy) {
      this.typeahead.push(data);
      return;
    }
    const event = interpretInput(this.line, data);

    switch (event.type) {
      case "edit":
        this.historyCursor = { ...this.historyCursor, index: null };
        this.redraw(event.state);
        return;
      case "history":
        this.navigateHistory(event.direction);
        return;
      case "interrupt":
        this.finishLine("^C");
        this.writePrompt();
        return;
      case "clear-screen":
        this.clearScreen();
        return;
      case "submit":
        await this.submit(event.line);
        return;
      case "ignore":
        return;
    }
  }

  private async submit(line: string): Promise<void> {
    this.finishLine();
    this.historyCursor = INITIAL_HISTORY_CURSOR;
    if (line.trim() === "") {
      this.writePrompt();
      return;
    }

    this.options.pushHistory(line);
    this.busy = true;
    try {
      const response = await this.options.executor(line);
      if (response.clearScreen) {
        this.surface.clear();
        this.surface.write("\r\x1b[2K");
      } else if (response.text !== "") {
        this.surface.write(`${response.text.replaceAll("\n", "\r\n")}\r\n`);
      }
      this.options.onTranscript?.(`${PLAIN_PROMPT}${line}\n${response.plainText}`);
    } catch (error) {
      // Executors should never reject; if one does, keep the terminal usable.
      console.error("[gitdojo] terminal executor failed", error);
      this.surface.write(
        `${ansi.error("fatal: something went wrong while running that command.")}\r\n`,
      );
    } finally {
      this.busy = false;
      this.writePrompt();
    }
    // Replay what was typed meanwhile; a replayed Enter may run (and buffer) the next command.
    for (const data of this.typeahead.splice(0)) await this.handleData(data);
  }

  private navigateHistory(direction: "previous" | "next"): void {
    const entries = this.options.getHistory();
    const step =
      direction === "previous"
        ? previousEntry(entries, this.historyCursor, this.line.buffer)
        : nextEntry(entries, this.historyCursor);
    if (!step) return;
    this.historyCursor = step.cursor;
    this.redraw({ buffer: step.line, cursor: step.line.length });
  }

  /** Moves the cursor past the current input (optionally appending a marker) and ends the line. */
  private finishLine(suffix = ""): void {
    this.redraw({ buffer: this.line.buffer, cursor: this.line.buffer.length });
    this.surface.write(`${suffix}\r\n`);
  }

  private writePrompt(): void {
    this.surface.write(renderPrompt());
    this.line = EMPTY_LINE;
    this.cursorOffset = PLAIN_PROMPT.length;
  }

  private redraw(state: LineState): void {
    const rendered = renderInputLine(this.cursorOffset, state, this.surface.cols);
    this.surface.write(rendered.data);
    this.line = state;
    this.cursorOffset = rendered.cursorOffset;
  }
}
