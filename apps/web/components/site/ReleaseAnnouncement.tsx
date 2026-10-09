import { ArrowUpRight, Sparkles } from "lucide-react";
import Link from "next/link";
import releaseInfo from "@/lib/release-info.json";

export interface ReleaseInfo {
  version: string | null;
  publishedAt: string | null;
  url: string | null;
  notes: string;
}

function ReleaseDate({ publishedAt }: { publishedAt: string | null }) {
  if (!publishedAt) return null;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.valueOf())) return null;
  return (
    <time dateTime={publishedAt}>
      {new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(date)}
    </time>
  );
}

export function ReleaseBanner({ release = releaseInfo }: { release?: ReleaseInfo }) {
  if (!release.version) return null;
  return (
    <aside
      aria-label={`Latest release ${release.version}`}
      className="border-b border-accent-border bg-accent-soft/70"
    >
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 text-center text-small sm:justify-start sm:px-6">
        <Sparkles aria-hidden="true" className="size-4 shrink-0 text-accent" />
        <span className="font-semibold text-fg">GitDojo {release.version} is live</span>
        <span className="text-fg-muted">·</span>
        <Link
          href="/whats-new"
          className="inline-flex min-h-8 items-center gap-1 font-medium text-accent underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          See what’s new <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    </aside>
  );
}

export function ReleaseAnnouncementPage({ release = releaseInfo }: { release?: ReleaseInfo }) {
  if (!release.version) {
    return (
      <section className="rounded-xl border border-border-subtle bg-panel p-6 sm:p-8">
        <p className="text-small text-fg-muted">Release notes</p>
        <h2 className="mt-2 text-h3 font-semibold text-fg">No releases yet</h2>
        <p className="mt-3 max-w-2xl text-body text-fg-secondary">
          When a new GitDojo release is published, its highlights will appear here.
        </p>
      </section>
    );
  }

  return (
    <article className="overflow-hidden rounded-xl border border-border-subtle bg-panel">
      <div className="border-b border-border-subtle bg-[radial-gradient(ellipse_at_top_left,rgb(108_140_255/0.16),transparent_65%)] px-6 py-8 sm:px-9 sm:py-10">
        <p className="inline-flex items-center gap-2 text-small font-medium text-accent">
          <Sparkles aria-hidden="true" className="size-4" /> Release announcement
        </p>
        <h2 className="mt-3 text-h2 font-bold tracking-tight text-fg">GitDojo {release.version}</h2>
        <p className="mt-2 text-small text-fg-muted">
          Released <ReleaseDate publishedAt={release.publishedAt} />
        </p>
      </div>
      <div className="px-6 py-6 sm:px-9 sm:py-8">
        <h3 className="text-h4 font-semibold text-fg">What’s new</h3>
        {release.notes ? (
          <div className="mt-4 space-y-3 text-body leading-relaxed text-fg-secondary">
            {release.notes
              .split(/\n\s*\n/)
              .filter(Boolean)
              .slice(0, 12)
              .map((paragraph, index) => {
                const lines = paragraph.split("\n").filter(Boolean);
                const items = lines.filter((line) => /^[-*] /.test(line));
                if (items.length === lines.length) {
                  return (
                    <ul key={index} className="list-disc space-y-2 pl-5 marker:text-accent">
                      {items.slice(0, 8).map((item) => (
                        <li key={item}>{item.replace(/^[-*] /, "")}</li>
                      ))}
                    </ul>
                  );
                }
                return (
                  <p key={index}>{lines.map((line) => line.replace(/^#{1,6} /, "")).join(" ")}</p>
                );
              })}
          </div>
        ) : (
          <p className="mt-4 text-body text-fg-secondary">
            See the approved release notes on GitHub.
          </p>
        )}
        <a
          href={release.url ?? "https://github.com/Aakashwije/GitDojo/releases"}
          className="mt-7 inline-flex min-h-10 items-center gap-2 rounded-md border border-border-strong px-4 py-2 text-small font-medium text-fg transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          target="_blank"
          rel="noreferrer"
        >
          Full release notes on GitHub <ArrowUpRight aria-hidden="true" className="size-4" />
        </a>
      </div>
    </article>
  );
}
