"use client";

import { useEffect } from "react";
import { applyTheme, readStoredTheme, subscribeTheme } from "../services/theme";

/**
 * Keeps every page on the learner's theme, including pages without the site header: re-applies
 * the saved choice after hydration (the browser chrome color is set here when the pre-paint
 * script ran before Next added its <meta>) and follows changes made in other tabs.
 */
export function ThemeSync() {
  useEffect(() => {
    applyTheme(readStoredTheme());
    return subscribeTheme(() => undefined);
  }, []);
  return null;
}
