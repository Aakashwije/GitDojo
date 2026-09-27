const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "just now", "2 minutes ago", ... for a Unix timestamp in seconds. */
export function formatRelativeTime(timestampSeconds: number, nowMs: number = Date.now()): string {
  const elapsed = Math.round(nowMs / 1000 - timestampSeconds);
  if (Math.abs(elapsed) < 45) return "just now";
  for (const [unit, seconds] of UNITS) {
    if (Math.abs(elapsed) >= seconds) {
      return relativeFormat.format(-Math.round(elapsed / seconds), unit);
    }
  }
  return relativeFormat.format(-Math.round(elapsed / 60), "minute");
}

export function formatTimestamp(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
