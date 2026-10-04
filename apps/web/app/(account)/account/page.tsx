import { Button } from "@gitdojo/ui";
import { HardDrive, LayoutDashboard } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { AccountAvatar } from "@/features/auth/components/AccountAvatar";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { withReturnPath } from "@/lib/auth/return-path";
import { getAccountSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

/** The signed-in learner's profile. Validated on the server; the proxy check is only a shortcut. */
export default async function AccountPage() {
  const session = await getAccountSession();
  if (session.status === "unconfigured") redirect("/sign-in");
  if (session.status === "signed-out") redirect(withReturnPath("/sign-in", "/account"));
  const { user } = session;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-h2 font-semibold tracking-tight text-fg sm:text-h1">Account</h1>

        <section
          aria-labelledby="profile-heading"
          data-testid="account-profile"
          className="mt-8 flex flex-wrap items-center gap-5 rounded-xl border border-border bg-panel p-6"
        >
          <AccountAvatar user={user} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 id="profile-heading" className="truncate text-h3 font-semibold text-fg">
              {user.name}
            </h2>
            {user.email ? (
              <p className="mt-1 truncate text-body text-fg-secondary">{user.email}</p>
            ) : null}
          </div>
          <SignOutButton />
        </section>

        <section
          aria-labelledby="progress-heading"
          className="mt-6 rounded-xl border border-border-subtle bg-surface p-6"
        >
          <h2
            id="progress-heading"
            className="flex items-center gap-2 text-body font-semibold text-fg"
          >
            <HardDrive className="size-4 text-fg-muted" aria-hidden="true" />
            Learning progress
          </h2>
          <p className="mt-2 text-small text-fg-secondary">
            Your lessons, XP and playground are saved in this browser. They are not linked to your
            account yet, and signing in or out never changes them.
          </p>
          <Button asChild variant="secondary" className="mt-4">
            <Link href="/dashboard">
              <LayoutDashboard aria-hidden="true" /> Open dashboard
            </Link>
          </Button>
        </section>

        <p className="mt-6 text-small text-fg-muted">
          Your email address and password are managed on GitDojo&apos;s secure sign-in pages.
        </p>
      </main>
    </>
  );
}
