import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard, AuthShell } from "@/features/auth/components/AuthShell";
import { SignOutRunner } from "@/features/auth/components/SignOutRunner";
import { readAuthConfig } from "@/lib/auth/config";
import { getAccountSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign out", robots: { index: false } };

export default async function SignOutPage() {
  if (!readAuthConfig().configured) redirect("/");
  if ((await getAccountSession()).status !== "signed-in") redirect("/auth/signed-out");
  return (
    <AuthShell>
      <AuthCard
        title="Sign out"
        description="Your learning progress and playground stay saved in this browser."
        testId="sign-out"
      >
        <SignOutRunner />
      </AuthCard>
    </AuthShell>
  );
}
