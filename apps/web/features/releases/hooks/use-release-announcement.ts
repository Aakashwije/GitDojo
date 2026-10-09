import { useCallback, useSyncExternalStore } from "react";
import { recordReleaseSeen, useReleaseSeenInProgress } from "@/features/progress";
import { markSeenOnDevice, seenOnDevice, subscribeSeenOnDevice } from "../services/seen-on-device";

/**
 * Marks a release's announcement as seen: when the learner opens its "What's new" page or
 * dismisses its banner, never because the banner was shown. Saved in this browser at once and
 * in the learner's progress, which syncs to a signed-in learner's account.
 */
export function markReleaseSeen(version: string): void {
  markSeenOnDevice(version);
  void recordReleaseSeen(version);
}

/**
 * Whether to show a release's banner: only once the learner's progress has loaded (so a release
 * dismissed on another device never flashes up) and only if neither their progress nor this
 * browser has seen it.
 */
export function useReleaseAnnouncement(version: string | null): {
  show: boolean;
  dismiss: () => void;
} {
  const onDevice = useSyncExternalStore(
    subscribeSeenOnDevice,
    () => version === null || seenOnDevice(version),
    // Rendered on the server as seen, so the banner only ever appears in the browser.
    () => true,
  );
  const inProgress = useReleaseSeenInProgress(version);
  const dismiss = useCallback(() => {
    if (version !== null) markReleaseSeen(version);
  }, [version]);
  return { show: version !== null && !onDevice && inProgress === false, dismiss };
}
