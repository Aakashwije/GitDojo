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
  title: "Sign in",
  description: "Sign in to your GitDojo account.",
};

const DESCRIPTION =
  "Sign in to your GitDojo account. Lessons, challenges and the playground work the same either way, and your progress stays saved in this browser.";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnPath(firstParam(params, "returnTo"));

  if (!readAuthConfig().configured) {
    return (
      <AuthShell>
        <AuthCard title="Welcome back" description={DESCRIPTION} testId="sign-in">
          <AuthUnavailable returnTo={returnTo} />
        </AuthCard>
      </AuthShell>
    );
  }

  // Already signed in: nothing to do here.
  if ((await getAccountSession()).status === "signed-in") redirect(returnTo);

  return (
    <AuthShell>
      <AuthCard title="Welcome back" description={DESCRIPTION} testId="sign-in">
        <AuthNotice status={firstParam(params, "status")} />
        <AuthStartButton label="Sign in" returnTo={returnTo} testId="start-sign-in" />
        <p className="mt-3 text-caption text-fg-muted">
          You&apos;ll continue on GitDojo&apos;s secure sign-in page.
        </p>
        <AuthLinks>
          <AuthLink href={withReturnPath("/sign-up", returnTo)}>Create an account</AuthLink>
          <AuthLink href={returnTo}>Continue learning without an account</AuthLink>
        </AuthLinks>
      </AuthCard>
    </AuthShell>
  );
}
