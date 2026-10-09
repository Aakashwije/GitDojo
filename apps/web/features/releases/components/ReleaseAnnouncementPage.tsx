import { Badge, Button } from "@gitdojo/ui";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { CURRENT_RELEASE, formatReleaseDate, type ReleaseInfo } from "../services/release-info";
import { InlineText } from "./InlineText";
import { MarkReleaseSeen } from "./MarkReleaseSeen";

const DEFAULT_INTRO = "Here’s what’s new for you in this release.";

/**
 * The "What's new" announcement: the version, its date, a short introduction and the learner
 * highlights from the approved release notes. Opening it marks the release seen.
 */
export function ReleaseAnnouncementPage({ release = CURRENT_RELEASE }: { release?: ReleaseInfo }) {
  if (!release.version) {
    return (
      <section
        aria-labelledby="no-release"
        className="rounded-xl border border-border-subtle bg-panel p-6 sm:p-8"
      >
        <h2 id="no-release" className="text-h3 font-semibold text-fg">
          No releases yet
        </h2>
        <p className="mt-3 max-w-2xl text-body text-fg-secondary">
          When a new version of GitDojo is released, you’ll find what changed for learners here.
        </p>
      </section>
    );
  }

  const date = formatReleaseDate(release.publishedAt);
  return (
    <article
      aria-labelledby="release-title"
      className="overflow-hidden rounded-xl border border-border-subtle bg-panel"
    >
      <header className="border-b border-border-subtle bg-[radial-gradient(ellipse_at_top_left,var(--accent-soft),transparent_70%)] px-5 py-8 sm:px-9 sm:py-10">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Badge tone="accent">
            <Sparkles aria-hidden="true" />
            Latest release
          </Badge>
          {date ? (
            <p className="text-small text-fg-muted">
              Released{" "}
              <time dateTime={release.publishedAt ?? undefined} className="text-fg-secondary">
                {date}
              </time>
            </p>
          ) : null}
        </div>
        <h2 id="release-title" className="mt-4 text-h2 font-bold tracking-tight text-fg">
          GitDojo {release.version}
        </h2>
        <p className="mt-3 max-w-2xl text-body-lg text-fg-secondary">
          {release.intro ? <InlineText text={release.intro} /> : DEFAULT_INTRO}
        </p>
      </header>

      <section aria-labelledby="release-highlights" className="px-5 py-7 sm:px-9 sm:py-9">
        <h3 id="release-highlights" className="text-h4 font-semibold text-fg">
          What you’ll notice
        </h3>
        {release.highlights.length > 0 ? (
          // `role="list"` keeps list semantics in Safari, which drops them without bullets.
          <ul role="list" className="mt-5 grid gap-3">
            {release.highlights.map((highlight) => (
              <li
                key={highlight}
                className="flex gap-3 rounded-lg border border-border-subtle bg-surface px-4 py-3.5"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <p className="min-w-0 text-body text-fg-secondary">
                  <InlineText text={highlight} />
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 max-w-2xl text-body text-fg-secondary">
            This release brings smaller improvements across GitDojo.
          </p>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-5 py-5 sm:px-9">
        <p className="max-w-md text-small text-fg-muted">
          When the next version arrives, a short banner at the top of GitDojo will let you know.
        </p>
        <Button asChild variant="primary">
          <Link href="/learn">
            Continue learning
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </footer>
      <MarkReleaseSeen version={release.version} />
    </article>
  );
}
