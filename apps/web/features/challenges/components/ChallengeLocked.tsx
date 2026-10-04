import { type ChallengeSummary } from "@gitdojo/shared-types";
import { Button } from "@gitdojo/ui";
import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { describeMissing } from "../services/challenge-navigation";

/** Shown for a challenge whose commands GitDojo cannot run yet. */
export function ChallengeLocked({ challenge }: { challenge: ChallengeSummary }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-col items-start px-4 py-20 sm:px-6">
        <div className="flex size-10 items-center justify-center rounded-lg border border-border-strong bg-elevated">
          <Lock className="size-5 text-fg-muted" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-h2 font-semibold text-fg">{challenge.title}</h1>
        <p className="mt-3 text-body text-fg-secondary">
          This challenge needs {describeMissing(challenge.missingCommands)}, which GitDojo does not
          support yet. It unlocks as soon as it does.
        </p>
        <Button asChild variant="secondary" className="mt-8">
          <Link href="/challenges">
            <ArrowLeft /> All challenges
          </Link>
        </Button>
      </main>
    </>
  );
}
