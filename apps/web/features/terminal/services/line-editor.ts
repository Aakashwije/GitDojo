/** Pure line-editing model for the terminal prompt. xterm only renders; this decides. */
export interface LineState {
  buffer: string;
  cursor: number;
}

export type EditorEvent =
  | { type: "edit"; state: LineState }
  | { type: "submit"; line: string }
  | { type: "interrupt" }
  | { type: "clear-screen" }
  | { type: "history"; direction: "previous" | "next" }
  | { type: "ignore" };

export const EMPTY_LINE: LineState = { buffer: "", cursor: 0 };

const KEYS = {
  enter: "\r",
  backspace: "\x7f",
  backspaceAlt: "\b",
  delete: "\x1b[3~",
  left: "\x1b[D",
  right: "\x1b[C",
  up: "\x1b[A",
  down: "\x1b[B",
  home: ["\x1b[H", "\x1bOH", "\x01"],
  end: ["\x1b[F", "\x1bOF", "\x05"],
  interrupt: "\x03",
  clearScreen: "\x0c",
  clearLine: "\x15",
} as const;

function edit(buffer: string, cursor: number): EditorEvent {
  return { type: "edit", state: { buffer, cursor } };
}

function insert(state: LineState, text: string): EditorEvent {
  const { buffer, cursor } = state;
  return edit(buffer.slice(0, cursor) + text + buffer.slice(cursor), cursor + text.length);
}

/** Keeps printable characters only: no control codes or escape sequences reach the buffer. */
function printable(text: string): string {
  let result = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) result += char;
    else if (char === "\t") result += " ";
  }
  return result;
}

export function interpretInput(state: LineState, data: string): EditorEvent {
  const { buffer, cursor } = state;

  switch (data) {
    case KEYS.enter:
      return { type: "submit", line: buffer };
    case KEYS.backspace:
    case KEYS.backspaceAlt:
      return cursor === 0
        ? { type: "ignore" }
        : edit(buffer.slice(0, cursor - 1) + buffer.slice(cursor), cursor - 1);
    case KEYS.delete:
      return cursor === buffer.length
        ? { type: "ignore" }
        : edit(buffer.slice(0, cursor) + buffer.slice(cursor + 1), cursor);
    case KEYS.left:
      return cursor === 0 ? { type: "ignore" } : edit(buffer, cursor - 1);
    case KEYS.right:
      return cursor === buffer.length ? { type: "ignore" } : edit(buffer, cursor + 1);
    case KEYS.up:
      return { type: "history", direction: "previous" };
    case KEYS.down:
      return { type: "history", direction: "next" };
    case KEYS.interrupt:
      return { type: "interrupt" };
    case KEYS.clearScreen:
      return { type: "clear-screen" };
    case KEYS.clearLine:
      return edit(buffer.slice(cursor), 0);
  }
  if ((KEYS.home as readonly string[]).includes(data)) return edit(buffer, 0);
  if ((KEYS.end as readonly string[]).includes(data)) return edit(buffer, buffer.length);
  // Unhandled escape sequences (function keys, alt combos, ...) are ignored.
  if (data.startsWith("\x1b")) return { type: "ignore" };

  // Pasted text: a trailing newline submits, like a real shell. Only the first line is used.
  const newlineIndex = data.search(/[\r\n]/);
  if (newlineIndex !== -1) {
    const inserted = insert(state, printable(data.slice(0, newlineIndex)));
    return inserted.type === "edit" ? { type: "submit", line: inserted.state.buffer } : inserted;
  }

  const text = printable(data);
  return text === "" ? { type: "ignore" } : insert(state, text);
}
