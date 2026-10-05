import { Info } from "lucide-react";
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthNotice } from "@/features/auth/components/AuthNotice";
import { AuthCard, AuthLink, AuthLinks, AuthShell } from "@/features/auth/components/AuthShell";
import { AuthStartButton } from "@/features/auth/components/AuthStartButton";
import { AuthUnavailable } from "@/features/auth/components/AuthUnavailable";
import { firstParam, type SearchParams } from "@/features/auth/services/search-params";
import { readAuthConfig } from "@/lib/auth/config";
import { safeReturnPath, withReturnPath } from "@/lib/auth/return-path";
import { getAccountSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a free GitDojo account.",
};

const DESCRIPTION =
  "Create a free GitDojo account. You choose your email and password on our secure sign-up page, and may be asked to confirm your email address.";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnPath(firstParam(params, "returnTo"));
  const config = readAuthConfig();

  if (!config.configured) {
    return (
      <AuthShell>
        <AuthCard title="Start your Git journey" description={DESCRIPTION} testId="sign-up">
          <AuthUnavailable returnTo={returnTo} />
        </AuthCard>
      </AuthShell>
    );
  }

  // Checked with the provider, not the profile cache: a session it has ended must be able to
  // sign in again right away.
  if ((await getAccountSession(undefined, { fresh: true })).status === "signed-in") {
    redirect(returnTo);
  }

  return (
    <AuthShell>
      <AuthCard
        title="Start your Git journey"
        description={
          config.selfRegistration
            ? DESCRIPTION
            : "New accounts can't be created right now. You can still learn everything without one."
        }
        testId="sign-up"
      >
        <AuthNotice status={firstParam(params, "status")} />
        {config.selfRegistration ? (
          <>
            <AuthStartButton label="Create account" returnTo={returnTo} testId="start-sign-up" />
            <p className="mt-3 text-caption text-fg-muted">
              On the next screen, choose{" "}
              <span className="font-medium text-fg-secondary">Register</span> to create your
              account.
            </p>
          </>
        ) : (
          <p
            role="status"
            data-testid="registration-closed"
            className="flex items-start gap-2 rounded-md border border-border-strong bg-elevated px-3 py-2.5 text-small text-fg-secondary"
          >
            <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              <span className="font-medium text-fg">Registration is closed.</span> Your progress is
              saved in this browser, so you won&apos;t lose anything by learning without an account.
            </span>
          </p>
        )}
        <AuthLinks>
          <AuthLink href={withReturnPath("/sign-in", returnTo)}>
            Already have an account? Sign in
          </AuthLink>
          <AuthLink href={returnTo}>Continue without an account</AuthLink>
        </AuthLinks>
      </AuthCard>
    </AuthShell>
  );
}
