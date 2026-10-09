// The releases feature's public API. Other features import only from here ("@/features/releases").
// Routes import the banner and the page by path, so the server never loads browser-only code.

export { ReleaseAnnouncementPage } from "./components/ReleaseAnnouncementPage";
export { ReleaseBanner } from "./components/ReleaseBanner";
export { markReleaseSeen, useReleaseAnnouncement } from "./hooks/use-release-announcement";
export { CURRENT_RELEASE, formatReleaseDate, type ReleaseInfo } from "./services/release-info";
