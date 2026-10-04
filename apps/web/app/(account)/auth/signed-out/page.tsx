import { Button } from "@gitdojo/ui";
import { ArrowRight } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { AuthCard, AuthLink, AuthLinks, AuthShell } from "@/features/auth/components/AuthShell";

export const metadata: Metadata = { title: "Signed out", robots: { index: false } };

/** Where the identity provider sends the learner after signing out. */
export default function SignedOutPage() {
  return (
    <AuthShell>
      <AuthCard
        title="You're signed out"
        description="Your learning progress and playground are still saved in this browser, so you can keep going without an account."
        testId="signed-out"
      >
        <Button asChild variant="primary" size="lg" className="w-full">
          <Link href="/learn">
            Continue learning <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <AuthLinks>
          <AuthLink href="/sign-in">Sign in again</AuthLink>
        </AuthLinks>
      </AuthCard>
    </AuthShell>
  );
}
