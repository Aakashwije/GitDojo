# Themes

GitDojo has a dark theme (the default) and a light theme. Learners switch with the sun/moon
button in the site header, the lesson and challenge workspace toolbar, and the playground
toolbar.

## How it works

- **Tokens, not per-theme colors.** `packages/ui/src/styles/theme.css` defines every semantic
  color once on `:root` (dark) and again under `:root[data-theme="light"]`. Components use the
  Tailwind utilities for those tokens (`bg-panel`, `text-fg-muted`, `border-border`, …) and follow
  whichever theme is active. Never hard-code a hex value or `black`/`white` in a component; if no
  token fits, add one to both blocks.
- **Choosing.** `setTheme` (`apps/web/features/theme`) sets `data-theme` and `color-scheme` on
  `<html>`, updates `<meta name="theme-color">` and `<meta name="color-scheme">`, and saves the
  choice in `localStorage` (`gitdojo:theme`). Nothing is saved until a learner chooses, so everyone
  keeps dark until then.
- **No flash.** The root layout renders `data-theme="dark"` and an inline script in `<head>`
  (`THEME_SCRIPT`) applies the saved theme while the HTML is parsed, before the first paint and
  before any JavaScript bundle loads. `suppressHydrationWarning` on `<html>` lets React keep the
  attributes the script set. This is the approach in Next's "Preventing flash before hydration" guide; pages stay statically
  prerendered.
- **Every tab.** `ThemeSync` (in the root layout) listens for `storage` events, so a change in one
  tab applies in the others, including pages without the site header.
- **The toggle** is a toggle button named "Dark theme" with `aria-pressed`, so assistive technology
  announces both what it controls and whether dark is on. Its tooltip says what pressing it does.

## Terminal, editor and graph

- **Terminal (xterm.js).** Output is colored by role (`ansi.success`, `ansi.branch`, …), written as
  extended palette slots (`ESC[38;5;16m` to `ESC[38;5;24m`) rather than fixed RGB. Each theme fills
  those slots (`terminalTheme` in `features/terminal/services/ansi.ts`), so switching themes
  recolors output that is already on screen. The dark palette is exactly the original one.
- **Editor (Monaco).** `gitdojo-dark` and `gitdojo-light` are both defined before Monaco mounts;
  the editor follows the active theme.
- **Repository graph.** Lane, edge and label colors are CSS variables (`--accent-secondary`,
  `--purple`, …), so they change with the tokens; React Flow's own controls get `colorMode` from the
  theme.

## The logo

The header and sign-in logos are the mark image plus live text ("Git" in `--text-primary`, "Dojo"
in `--accent-primary`), so they stay crisp and follow the theme. The full lockups are for static
contexts: `apps/web/public/brand/gitdojo-logo-light.png` (dark text, for light backgrounds) is shown
in the README on light-mode GitHub, with the dark banner otherwise.

## Checks

| Check                                                    | What it covers                                                                                                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/features/theme/theme.test.tsx`                 | The inline script (default, saved, corrupt and blocked storage), saving, metas, the toggle's name, state, keyboard use and other tabs                                      |
| `apps/web/features/terminal/services/ansi-theme.test.ts` | Palette-slot output, the unchanged dark palette, and 4.5:1 for every light terminal color                                                                                  |
| `apps/web/e2e/theme.spec.ts`                             | Toggling, reload and navigation, the theme applied with all JavaScript blocked, other tabs, phone width, and the workspace and playground toolbars recoloring the terminal |
| `apps/web/e2e/accessibility.spec.ts`                     | axe WCAG 2.1 AA (including color contrast) on every scanned page, dialog and workspace, in **both** themes                                                                 |
