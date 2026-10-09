import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReleaseAnnouncementPage, ReleaseBanner, type ReleaseInfo } from "./ReleaseAnnouncement";

const RELEASE: ReleaseInfo = {
  version: "v0.1.12",
  publishedAt: "2026-10-09T09:30:00.000Z",
  url: "https://github.com/Aakashwije/GitDojo/releases/tag/v0.1.12",
  notes: "## What’s Changed\n\n- Added lesson hints.\n- Improved the Git graph.",
};

describe("release announcement", () => {
  it("shows a site-wide banner linking to the announcement", () => {
    render(<ReleaseBanner release={RELEASE} />);
    expect(
      screen.getByRole("complementary", { name: "Latest release v0.1.12" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See what’s new" })).toHaveAttribute(
      "href",
      "/whats-new",
    );
  });

  it("shows the version, publication date, approved notes and GitHub link", () => {
    render(<ReleaseAnnouncementPage release={RELEASE} />);
    expect(screen.getByRole("heading", { level: 2, name: "GitDojo v0.1.12" })).toBeInTheDocument();
    expect(screen.getByText("October 9, 2026")).toBeInTheDocument();
    expect(screen.getByText("Added lesson hints.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Full release notes on GitHub" })).toHaveAttribute(
      "href",
      RELEASE.url,
    );
  });

  it("keeps the release page useful before the first release", () => {
    render(<ReleaseAnnouncementPage />);
    expect(screen.getByRole("heading", { level: 2, name: "No releases yet" })).toBeInTheDocument();
  });
});
