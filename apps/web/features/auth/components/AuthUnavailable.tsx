import { Button } from "@gitdojo/ui";
import { ArrowRight, Info } from "lucide-react";
import Link from "next/link";

/** Shown instead of the sign-in actions when accounts are not set up on this site. */
export function AuthUnavailable({ returnTo }: { returnTo: string }) {
  return (
    <div data-testid="auth-unavailable">
      <p
        role="status"
        className="flex items-start gap-2 rounded-md border border-border-strong bg-elevated px-3 py-2.5 text-small text-fg-secondary"
      >
        <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
        <span>
          <span className="font-medium text-fg">
            Accounts aren&apos;t available on this site yet.
          </span>{" "}
          Lessons, challenges, the playground and your dashboard all work without one, and your
          progress is saved in this browser.
        </span>
      </p>
      <Button asChild variant="primary" size="lg" className="mt-5 w-full">
        <Link href={returnTo}>
          Continue learning <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
