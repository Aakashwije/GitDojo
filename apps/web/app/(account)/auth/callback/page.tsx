import { type Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthCard, AuthShell } from "@/features/auth/components/AuthShell";
import { CallbackProgress } from "@/features/auth/components/CallbackProgress";
import { firstParam, type SearchParams } from "@/features/auth/services/search-params";
import { readAuthConfig } from "@/lib/auth/config";
import { RETURN_PATH_COOKIE, safeReturnPath } from "@/lib/auth/return-path";
import { getAccountSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Signing in", robots: { index: false } };

/**
 * Where the identity provider sends the learner back (an authorized redirect URL). The SDK
 * provider completes the sign-in in the browser, then navigates here again without parameters,
 * and the learner is sent to the page they started from.
 */
export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!readAuthConfig().configured) redirect("/sign-in");
  const params = await searchParams;
  const returnTo = safeReturnPath((await cookies()).get(RETURN_PATH_COOKIE)?.value);
  const back = (status?: string) =>
    `/sign-in?${status ? `status=${status}&` : ""}returnTo=${encodeURIComponent(returnTo)}`;

  const error = firstParam(params, "error");
  if (error) {
    // `access_denied` is what the provider sends when the learner cancels or declines.
    redirect(back(error === "access_denied" ? "cancelled" : "failed"));
  }

  if (firstParam(params, "code") && firstParam(params, "state")) {
    return (
      <AuthShell>
        <AuthCard
          title="Welcome to GitDojo"
          description="One moment while we sign you in."
          testId="callback"
        >
          <CallbackProgress returnTo={returnTo} />
        </AuthCard>
      </AuthShell>
    );
  }

  if ((await getAccountSession()).status === "signed-in") redirect(returnTo);
  redirect(back());
}
