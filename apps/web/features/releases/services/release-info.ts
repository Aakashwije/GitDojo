import releaseInfo from "@/lib/release-info.json";

/**
 * The release learners are told about, written at production build time from the approved
 * release notes' "Highlights for learners" section (scripts/write-release-info.mjs). Only these
 * fields reach the app; the full changelog stays on GitHub.
 */
export interface ReleaseInfo {
  /** The release tag, such as `v0.1.12`; `null` before the first release. */
  version: string | null;
  publishedAt: string | null;
  /** An optional sentence introducing the release. */
  intro: string | null;
  /** 1–5 learner-facing highlights, validated when the release was published. */
  highlights: string[];
}

export const CURRENT_RELEASE: ReleaseInfo = {
  version: releaseInfo.version,
  publishedAt: releaseInfo.publishedAt,
  intro: releaseInfo.intro,
  highlights: releaseInfo.highlights,
};

/** "October 9, 2026", or `null` for a missing or invalid date. Always UTC, like the release. */
export function formatReleaseDate(publishedAt: string | null): string | null {
  if (!publishedAt) return null;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.valueOf())) return null;
  return new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(date);
}
