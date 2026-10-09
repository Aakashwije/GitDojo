/** 24-bit ANSI helpers using the GitDojo terminal palette (docs/ui.md §25). */
function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `${String((value >> 16) & 255)};${String((value >> 8) & 255)};${String(value & 255)}`;
}

const color = (hex: string) => (text: string) => `\x1b[38;2;${rgb(hex)}m${text}\x1b[39m`;

export const ansi = {
  user: color("#4fd18b"),
  path: color("#62b6ff"),
  command: color("#f4f7fb"),
  muted: color("#7c8593"),
  warning: color("#f5c451"),
  error: color("#f06a78"),
  success: color("#4fd18b"),
  accent: color("#6c8cff"),
  branch: color("#f59e5b"),
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
};

export const TERMINAL_THEME = {
  background: "#080a0d",
  foreground: "#d6dce5",
  cursor: "#aebfff",
  cursorAccent: "#080a0d",
  selectionBackground: "#6c8cff59",
  scrollbarSliderBackground: "#343c4866",
  scrollbarSliderHoverBackground: "#343c48aa",
  scrollbarSliderActiveBackground: "#343c48",
  black: "#151920",
  red: "#f06a78",
  green: "#4fd18b",
  yellow: "#f5c451",
  blue: "#6c8cff",
  magenta: "#a78bfa",
  cyan: "#62b6ff",
  white: "#d6dce5",
  brightBlack: "#5f6875",
  brightRed: "#f06a78",
  brightGreen: "#4fd18b",
  brightYellow: "#f5c451",
  brightBlue: "#7c9aff",
  brightMagenta: "#a78bfa",
  brightCyan: "#62b6ff",
  brightWhite: "#f4f7fb",
} as const;

export const PROMPT_USER = "learner@gitdojo";
export const PROMPT_PATH = "~/project";

export function renderPrompt(): string {
  return `${ansi.user(PROMPT_USER)} ${ansi.path(PROMPT_PATH)} ${ansi.muted("$")} `;
}

/** Visible (escape-free) prompt text, e.g. for screen-reader transcripts. */
export const PLAIN_PROMPT = `${PROMPT_USER} ${PROMPT_PATH} $ `;
