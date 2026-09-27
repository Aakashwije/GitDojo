import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./time";

describe("formatRelativeTime", () => {
  const now = 1_700_000_000_000;
  const secondsAgo = (seconds: number) => now / 1000 - seconds;

  it("formats recent and older timestamps", () => {
    expect(formatRelativeTime(secondsAgo(10), now)).toBe("just now");
    expect(formatRelativeTime(secondsAgo(120), now)).toBe("2 minutes ago");
    expect(formatRelativeTime(secondsAgo(3 * 3600), now)).toBe("3 hours ago");
    expect(formatRelativeTime(secondsAgo(86_400), now)).toBe("yesterday");
  });
});
