import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";

vi.mock("@/features/auth", () => ({ AccountControls: () => null }));
vi.mock("./logo", () => ({ Logo: () => "GitDojo" }));

describe("site header", () => {
  it("does not link to What's new: the release banner is the only way in, until it is seen", () => {
    render(<SiteHeader />);
    // Both the inline navigation and the phone menu (hidden until opened).
    const links = screen.getAllByRole("link", { hidden: true });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).not.toHaveAttribute("href", "/whats-new");
      expect(link).not.toHaveTextContent(/what.s new/i);
    }
  });
});
