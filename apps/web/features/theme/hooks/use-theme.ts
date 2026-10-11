"use client";

import { useSyncExternalStore } from "react";
import { activeTheme, DEFAULT_THEME, subscribeTheme, type Theme } from "../services/theme";

/**
 * The active theme, re-rendering when it changes here or in another tab. Renders the default on
 * the server; the pre-paint script has already applied the real one to the page itself.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, activeTheme, () => DEFAULT_THEME);
}
