"use client";

import { IconButton } from "@gitdojo/ui";
import { ArrowRight, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useReleaseAnnouncement } from "../hooks/use-release-announcement";
import { CURRENT_RELEASE, type ReleaseInfo } from "../services/release-info";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The first focusable element after `element`, so dismissing never drops focus to the page. */
function nextFocusable(element: HTMLElement): HTMLElement | null {
  for (const candidate of document.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (
      !element.contains(candidate) &&
      element.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING
    ) {
      return candidate;
    }
  }
  return null;
}

/**
 * A slim, site-wide note about the latest release, until the learner opens "What's new" or
 * dismisses it. It never dismisses itself, and appearing does not count as seen.
 */
export function ReleaseBanner({ release = CURRENT_RELEASE }: { release?: ReleaseInfo }) {
  const pathname = usePathname();
  const { show, dismiss } = useReleaseAnnouncement(release.version);
  const [dismissed, setDismissed] = useState(false);
  const banner = useRef<HTMLElement>(null);
  const labelId = useId();
  const count = release.highlights.length;
  // The page itself is the announcement, and opening it marks the release seen.
  const visible = show && pathname !== "/whats-new";

  return (
    <>
      {visible ? (
        <aside
          ref={banner}
          aria-labelledby={labelId}
          className="border-b border-accent-border bg-accent-soft"
        >
          <div className="mx-auto flex max-w-[1280px] items-center gap-3 py-1.5 pr-2 pl-4 sm:pr-4 sm:pl-6">
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-md bg-accent/15 text-accent"
            >
              <Sparkles className="size-3.5" />
            </span>
            <p id={labelId} className="min-w-0 flex-1 text-small text-fg-secondary">
              <span className="font-semibold text-fg">GitDojo {release.version} is here</span>
              {count > 0 ? (
                <span className="max-sm:hidden">
                  {" "}
                  with {count} {count === 1 ? "update" : "updates"} for learners
                </span>
              ) : null}
              <span aria-hidden="true" className="px-1.5 text-fg-faint">
                ·
              </span>
              <Link
                href="/whats-new"
                className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-accent underline-offset-4 hover:underline"
              >
                See what’s new
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            </p>
            <IconButton
              aria-label={`Dismiss the GitDojo ${release.version ?? ""} announcement`}
              className="shrink-0 text-fg-muted hover:text-fg"
              onClick={() => {
                const element = banner.current;
                const next = element ? nextFocusable(element) : null;
                dismiss();
                setDismissed(true);
                next?.focus({ preventScroll: true });
              }}
            >
              <X />
            </IconButton>
          </div>
        </aside>
      ) : null}
      {/* Always present, so screen readers hear the confirmation after the banner is gone. */}
      <p role="status" className="sr-only">
        {dismissed ? "Announcement dismissed. You can find it any time under What’s new." : ""}
      </p>
    </>
  );
}
