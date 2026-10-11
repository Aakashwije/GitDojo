// The theme feature's public API. Other features import only from here ("@/features/theme").
// The root layout imports ThemeSync and THEME_SCRIPT by path.

export { ThemeToggle } from "./components/ThemeToggle";
export { useTheme } from "./hooks/use-theme";
export { applyTheme, setTheme, THEME_COLORS, type Theme } from "./services/theme";
