"use client";

import { IconButton, Tooltip, TooltipProvider } from "@gitdojo/ui";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/use-theme";
import { setTheme } from "../services/theme";

/**
 * Light/Dark switch for the site header. A toggle button: its name says what it controls and
 * `aria-pressed` says whether dark is on, so assistive technology announces the current state.
 */
export function ThemeToggle() {
  const theme = useTheme();
  const dark = theme === "dark";
  // Its own provider, so the header works wherever it is rendered (nested providers are fine).
  return (
    <TooltipProvider>
      <Tooltip side="bottom" content={dark ? "Switch to light theme" : "Switch to dark theme"}>
        <IconButton
          aria-label="Dark theme"
          aria-pressed={dark}
          data-testid="theme-toggle"
          onClick={() => {
            setTheme(dark ? "light" : "dark");
          }}
        >
          {dark ? <Moon /> : <Sun />}
        </IconButton>
      </Tooltip>
    </TooltipProvider>
  );
}
