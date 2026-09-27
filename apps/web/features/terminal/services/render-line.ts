import { ansi, PLAIN_PROMPT, renderPrompt } from "./ansi";
import { type LineState } from "./line-editor";

const ESC = "\x1b";

/**
 * Row (0-based) the cursor sits on after `chars` visible characters starting at column 0.
 * When a row is exactly full, xterm keeps the cursor on that row in a "pending wrap" state.
 */
export function rowOffset(chars: number, cols: number): number {
  if (cols <= 0 || chars === 0) return 0;
  return chars % cols === 0 ? chars / cols - 1 : Math.floor(chars / cols);
}

export interface RenderedLine {
  data: string;
  /** Visible characters from the start of the prompt to the cursor. */
  cursorOffset: number;
}

/**
 * Redraws prompt + input in place. Moving up by the wrapped rows before redrawing keeps long
 * commands correct on narrow (mobile) terminals, and saving/restoring the cursor places it
 * mid-line without relying on cursor-left, which cannot cross wrapped rows.
 */
export function renderInputLine(
  previousCursorOffset: number,
  state: LineState,
  cols: number,
): RenderedLine {
  const up = rowOffset(previousCursorOffset, cols);
  const before = state.buffer.slice(0, state.cursor);
  const after = state.buffer.slice(state.cursor);
  const data =
    (up > 0 ? `${ESC}[${String(up)}A` : "") +
    `\r${ESC}[J${renderPrompt()}` +
    (before ? ansi.command(before) : "") +
    (after ? `${ESC}7${ansi.command(after)}${ESC}8` : "");
  return { data, cursorOffset: PLAIN_PROMPT.length + state.cursor };
}
