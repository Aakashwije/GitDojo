import { describe, expect, it } from "vitest";
import { ansi, terminalBanner, terminalTheme } from "./ansi";

describe("terminal colors", () => {
  it("writes roles as palette slots, so a theme change recolors output already on screen", () => {
    expect(ansi.error("fatal")).toBe("\x1b[38;5;21mfatal\x1b[39m");
    expect(ansi.branch("main")).toBe("\x1b[38;5;24mmain\x1b[39m");
    expect(ansi.command("help")).not.toContain("38;2;");
  });

  it("keeps the dark theme exactly as it was", () => {
    const dark = terminalTheme("dark");
    expect(dark).toMatchObject({ background: "#080a0d", foreground: "#d6dce5", red: "#f06a78" });
    // user, path, command, muted, warning, error, success, accent, branch
    expect(dark.extendedAnsi).toEqual([
      "#4fd18b",
      "#62b6ff",
      "#f4f7fb",
      "#7c8593",
      "#f5c451",
      "#f06a78",
      "#4fd18b",
      "#6c8cff",
      "#f59e5b",
    ]);
  });

  it("gives every role a readable color on the light terminal", () => {
    const light = terminalTheme("light");
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const color of [...light.extendedAnsi, light.foreground, light.red, light.green]) {
      expect(contrast(color, light.background), color).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("builds the workspace welcome message from the same roles", () => {
    expect(terminalBanner(["Welcome.", "Type help to start."], "help")).toBe(
      `${ansi.muted("Welcome.")}\r\n${ansi.muted("Type ")}${ansi.command("help")}${ansi.muted(" to start.")}`,
    );
  });
});
