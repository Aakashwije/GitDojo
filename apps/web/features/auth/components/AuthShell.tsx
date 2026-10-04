import { cn } from "@gitdojo/ui";
import Link from "next/link";
import { type ReactNode } from "react";
import { Logo, LogoMark } from "@/components/site/logo";

/**
 * Layout for GitDojo's own account pages: the card on one side and a small Git illustration on
 * the other (desktop), a single column on phones. Credentials are never entered here; the
 * buttons hand over to the identity provider's hosted pages.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-app lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col px-4 py-5 sm:px-8">
        <Link href="/" aria-label="GitDojo home" className="self-start rounded-md">
          <Logo />
        </Link>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
      <aside
        aria-hidden="true"
        className="relative hidden overflow-hidden border-l border-border-subtle bg-surface lg:flex lg:items-center lg:justify-center"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(108_140_255/0.12),transparent_65%)]" />
        <AuthIllustration />
      </aside>
    </div>
  );
}

/** The card: logo, heading, explanation and the page's actions. */
export function AuthCard({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      aria-labelledby="auth-title"
      data-testid={testId}
      className="rounded-xl border border-border bg-panel p-6 shadow-2xl shadow-black/30 sm:p-8"
    >
      <LogoMark className="size-10" />
      <h1 id="auth-title" className="mt-5 text-h2 font-semibold tracking-tight text-fg">
        {title}
      </h1>
      <div className="mt-2 text-body text-fg-secondary">{description}</div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Secondary navigation under the main action. */
export function AuthLinks({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mt-6 flex flex-col gap-3 border-t border-border-subtle pt-5 text-small",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-6 items-center self-start rounded-sm text-fg-secondary underline-offset-4 hover:text-fg hover:underline"
    >
      {children}
    </Link>
  );
}

const TERMINAL: { prompt?: boolean; text: string; tone?: string }[] = [
  { prompt: true, text: "git switch -c feature/profile" },
  { text: "Switched to a new branch 'feature/profile'", tone: "text-fg-muted" },
  { prompt: true, text: 'git commit -m "Add profile page"' },
  { text: "[feature/profile 3f2a9c1] Add profile page", tone: "text-fg-muted" },
  { prompt: true, text: "git switch main && git merge feature/profile" },
  { text: "Merge made by the 'ort' strategy.", tone: "text-success" },
];

/** A terminal and the commit graph it produces. Decorative only. */
function AuthIllustration() {
  return (
    <div className="relative w-full max-w-md px-8">
      <svg viewBox="0 0 320 150" className="w-full" role="presentation">
        <path d="M24 110 H296" stroke="var(--accent-primary)" strokeWidth="3" fill="none" />
        <path
          d="M100 110 C130 110 130 40 160 40 H220 C250 40 250 110 270 110"
          stroke="var(--accent-secondary)"
          strokeWidth="3"
          fill="none"
        />
        {[24, 100, 296].map((x) => (
          <circle
            key={x}
            cx={x}
            cy={110}
            r="8"
            fill="var(--bg-panel)"
            stroke="var(--accent-primary)"
            strokeWidth="3"
          />
        ))}
        {[160, 220].map((x) => (
          <circle
            key={x}
            cx={x}
            cy={40}
            r="8"
            fill="var(--bg-panel)"
            stroke="var(--accent-secondary)"
            strokeWidth="3"
          />
        ))}
        <circle cx={270} cy={110} r="9" fill="var(--accent-primary)" />
        <text x="24" y="140" fill="var(--text-muted)" fontSize="12" fontFamily="var(--font-mono)">
          main
        </text>
        <text x="160" y="20" fill="var(--text-muted)" fontSize="12" fontFamily="var(--font-mono)">
          feature/profile
        </text>
      </svg>
      <div className="mt-8 overflow-hidden rounded-lg border border-border bg-terminal shadow-2xl shadow-black/40">
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-2">
          <span className="size-2.5 rounded-full bg-danger/70" />
          <span className="size-2.5 rounded-full bg-warning/70" />
          <span className="size-2.5 rounded-full bg-success/70" />
        </div>
        <pre className="overflow-hidden px-4 py-3 font-mono text-caption leading-6 text-fg-terminal">
          {TERMINAL.map((line, index) => (
            <span key={index} className={cn("block truncate", line.tone)}>
              {line.prompt ? <span className="text-success">$ </span> : null}
              {line.text}
            </span>
          ))}
        </pre>
      </div>
      <p className="mt-6 text-center text-small text-fg-muted">
        Learn it. Break it. Fix it. Master it.
      </p>
    </div>
  );
}
