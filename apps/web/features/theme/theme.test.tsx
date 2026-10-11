import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@gitdojo/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./components/ThemeToggle";
import {
  applyTheme,
  readStoredTheme,
  setTheme,
  THEME_COLORS,
  THEME_STORAGE_KEY,
} from "./services/theme";
import { THEME_SCRIPT } from "./services/theme-script";

const root = document.documentElement;

function addMeta(name: string, content: string) {
  const meta = document.createElement("meta");
  meta.name = name;
  meta.content = content;
  document.head.append(meta);
  return meta;
}

/** A fresh page as the server renders it: dark, with Next's two metas. */
function serverRenderedPage() {
  document.head.innerHTML = "";
  root.removeAttribute("style");
  root.dataset.theme = "dark";
  addMeta("theme-color", THEME_COLORS.dark);
  addMeta("color-scheme", "dark");
}

/** The exact inline script the layout puts in <head>. */
// eslint-disable-next-line @typescript-eslint/no-implied-eval -- running the shipped script verbatim
const runThemeScript = new Function(THEME_SCRIPT) as () => void;

const meta = (name: string) =>
  document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;

beforeEach(() => {
  localStorage.clear();
  serverRenderedPage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("theme", () => {
  it("defaults to dark, so nothing changes until a learner chooses", () => {
    expect(readStoredTheme()).toBe("dark");
    runThemeScript();
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("applies the saved theme before the app runs: tokens, native controls and browser chrome", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    runThemeScript();
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
    expect(meta("theme-color")).toBe(THEME_COLORS.light);
    expect(meta("color-scheme")).toBe("light");
  });

  it("ignores a corrupt saved value and survives blocked storage", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "solarized");
    runThemeScript();
    expect(root.dataset.theme).toBe("dark");

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(runThemeScript).not.toThrow();
    expect(root.dataset.theme).toBe("dark");
    expect(readStoredTheme()).toBe("dark");
  });

  it("saves a choice and applies it everywhere it shows", () => {
    setTheme("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(root.dataset.theme).toBe("light");
    expect(meta("theme-color")).toBe(THEME_COLORS.light);
    setTheme("dark");
    expect(root.dataset.theme).toBe("dark");
    expect(meta("color-scheme")).toBe("dark");
  });

  it("still switches this tab when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    setTheme("light");
    expect(root.dataset.theme).toBe("light");
  });
});

describe("theme toggle", () => {
  const renderToggle = () =>
    render(
      <TooltipProvider>
        <ThemeToggle />
      </TooltipProvider>,
    );

  it("is a named toggle button that exposes whether dark is on", () => {
    renderToggle();
    const toggle = screen.getByRole("button", { name: "Dark theme" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("switches and saves the theme from the keyboard", async () => {
    const user = userEvent.setup();
    renderToggle();
    const toggle = screen.getByRole("button", { name: "Dark theme" });
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(root.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.keyboard(" ");
    expect(root.dataset.theme).toBe("dark");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("follows a change made in another tab", () => {
    renderToggle();
    act(() => {
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      window.dispatchEvent(
        new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "light" }),
      );
    });
    expect(root.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("reflects a theme applied before it rendered", () => {
    applyTheme("light");
    renderToggle();
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
