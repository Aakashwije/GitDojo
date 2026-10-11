import { type Theme } from "@/features/theme";

/**
 * Terminal colors by role, written as palette slots rather than fixed RGB, so the active theme
 * decides what they look like and output already on screen recolors when the theme changes.
 * Slots 16+ are xterm's extended palette, which each theme below fills in (docs/ui.md §25).
 */
const SLOT = {
  user: 16,
  path: 17,
  command: 18,
  muted: 19,
  warning: 20,
  error: 21,
  success: 22,
  accent: 23,
  branch: 24,
} as const;

type Role = keyof typeof SLOT;

const color = (role: Role) => (text: string) => `\x1b[38;5;${String(SLOT[role])}m${text}\x1b[39m`;

export const ansi = {
  user: color("user"),
  path: color("path"),
  command: color("command"),
  muted: color("muted"),
  warning: color("warning"),
  error: color("error"),
  success: color("success"),
  accent: color("accent"),
  branch: color("branch"),
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
};

/** Role colors per theme, from the design tokens. Dark is exactly the original palette. */
const ROLE_COLORS: Readonly<Record<Theme, Readonly<Record<Role, string>>>> = {
  dark: {
    user: "#4fd18b",
    path: "#62b6ff",
    command: "#f4f7fb",
    muted: "#7c8593",
    warning: "#f5c451",
    error: "#f06a78",
    success: "#4fd18b",
    accent: "#6c8cff",
    branch: "#f59e5b",
  },
  // Each passes 4.5:1 on the light terminal background (#fbfcfd).
  light: {
    user: "#11703a",
    path: "#0a68b8",
    command: "#111827",
    muted: "#556070",
    warning: "#8a5a00",
    error: "#c0263a",
    success: "#11703a",
    accent: "#3a5ad6",
    branch: "#a3480a",
  },
};

function extendedAnsi(theme: Theme): string[] {
  const roles = ROLE_COLORS[theme];
  return (Object.keys(SLOT) as Role[]).sort((a, b) => SLOT[a] - SLOT[b]).map((role) => roles[role]);
}

const DARK_TERMINAL = {
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
};

/** Light: dark ink on --bg-terminal; "white" and "black" swap roles so plain text stays legible. */
const LIGHT_TERMINAL: typeof DARK_TERMINAL = {
  background: "#fbfcfd",
  foreground: "#1f2733",
  cursor: "#3a5ad6",
  cursorAccent: "#fbfcfd",
  selectionBackground: "#3a5ad640",
  scrollbarSliderBackground: "#c2c9d388",
  scrollbarSliderHoverBackground: "#a3abb7aa",
  scrollbarSliderActiveBackground: "#8a93a1",
  black: "#1f2733",
  red: "#c0263a",
  green: "#11703a",
  yellow: "#8a5a00",
  blue: "#3a5ad6",
  magenta: "#6d4ad1",
  cyan: "#0a68b8",
  white: "#3d4756",
  brightBlack: "#556070",
  brightRed: "#a51f31",
  brightGreen: "#0e5f31",
  brightYellow: "#744b00",
  brightBlue: "#2f4ec4",
  brightMagenta: "#5b3cbc",
  brightCyan: "#08599e",
  brightWhite: "#111827",
};

/** xterm.js options.theme for a GitDojo theme. */
export function terminalTheme(theme: Theme) {
  return {
    ...(theme === "light" ? LIGHT_TERMINAL : DARK_TERMINAL),
    extendedAnsi: extendedAnsi(theme),
  };
}

/** The default (dark) terminal theme. */
export const TERMINAL_THEME = terminalTheme("dark");

/**
 * A welcome message in the terminal's muted color, with `command` (such as `help`) picked out, as
 * the workspaces show when the terminal starts.
 */
export function terminalBanner(lines: readonly string[], command: string): string {
  return lines
    .map((line) =>
      line
        .split(command)
        .map((part) => ansi.muted(part))
        .join(ansi.command(command)),
    )
    .join("\r\n");
}

export const PROMPT_USER = "learner@gitdojo";
export const PROMPT_PATH = "~/project";

export function renderPrompt(): string {
  return `${ansi.user(PROMPT_USER)} ${ansi.path(PROMPT_PATH)} ${ansi.muted("$")} `;
}

/** Visible (escape-free) prompt text, e.g. for screen-reader transcripts. */
export const PLAIN_PROMPT = `${PROMPT_USER} ${PROMPT_PATH} $ `;
