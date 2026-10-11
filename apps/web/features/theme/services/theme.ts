/**
 * The learner's color theme. Dark is the default, so nobody's GitDojo changes until they pick
 * light. The choice is kept in this browser (localStorage), applied to <html> before the first
 * paint by {@link THEME_SCRIPT}, and followed by every open tab.
 */

export type Theme = "dark" | "light";

export const THEMES: readonly Theme[] = ["dark", "light"];
export const DEFAULT_THEME: Theme = "dark";
export const THEME_STORAGE_KEY = "gitdojo:theme";

/** The browser chrome color for each theme: each theme's --bg-app. */
export const THEME_COLORS: Readonly<Record<Theme, string>> = {
  dark: "#0b0d10",
  light: "#f4f6f9",
};

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Accessing localStorage throws when site data is blocked.
    return null;
  }
}

export function readStoredTheme(): Theme {
  try {
    const stored = storage()?.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** The theme on <html> right now: what the page is actually showing. */
export function activeTheme(): Theme {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const theme = document.documentElement.dataset.theme;
  return isTheme(theme) ? theme : DEFAULT_THEME;
}

const listeners = new Set<() => void>();

/**
 * Shows a theme: the tokens (`data-theme`), native controls and scrollbars (`color-scheme`) and
 * the browser chrome (`<meta name="theme-color">`). Does not save it.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const changed = root.dataset.theme !== theme;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = THEME_COLORS[theme];
  }
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="color-scheme"]')) {
    meta.content = theme;
  }
  if (changed) for (const listener of listeners) listener();
}

/** The learner chose a theme: show it here, remember it, and let other tabs follow. */
export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    storage()?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Blocked or full: the theme still applies to this tab.
  }
}

/** Calls back when the theme changes, here or in another tab (which this tab then follows). */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    // `key === null`: another tab cleared site storage, which means the default again.
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    applyTheme(isTheme(event.newValue) ? event.newValue : DEFAULT_THEME);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
