import { Button } from "@gitdojo/ui";
import { CloudOff, SearchX } from "lucide-react";
import Link from "next/link";

/** An id that is malformed or not in GitDojo's records. Never a server error. */
export function CredentialNotFound() {
  return (
    <section
      aria-labelledby="not-found-heading"
      data-testid="credential-not-found"
      className="rounded-xl border border-border bg-panel p-6 sm:p-8"
    >
      <SearchX className="size-10 text-fg-muted" aria-hidden="true" />
      <h1 id="not-found-heading" className="mt-4 text-h2 font-bold tracking-tight text-fg">
        Credential not found
      </h1>
      <p className="mt-3 max-w-2xl text-body text-fg-secondary">
        GitDojo has no certificate with this ID. It can&apos;t be confirmed as a GitDojo credential.
      </p>
      <ul className="mt-4 max-w-2xl list-disc space-y-1 pl-5 text-small text-fg-secondary">
        <li>
          Check the link: the ID is the 36 characters after <code>/verify/</code>, as printed on the
          certificate.
        </li>
        <li>Scan the certificate&apos;s QR code again, or ask the holder for a fresh link.</li>
      </ul>
      <Button asChild variant="secondary" className="mt-6">
        <Link href="/">Go to GitDojo</Link>
      </Button>
    </section>
  );
}

/** The records could not be read. The credential is neither confirmed nor denied. */
export function CredentialUnavailable() {
  return (
    <section
      aria-labelledby="unavailable-heading"
      data-testid="credential-unavailable"
      className="rounded-xl border border-warning/50 bg-warning-soft p-6 sm:p-8"
    >
      <CloudOff className="size-10 text-warning" aria-hidden="true" />
      <h1 id="unavailable-heading" className="mt-4 text-h2 font-bold tracking-tight text-fg">
        Verification is unavailable right now
      </h1>
      <p className="mt-3 max-w-2xl text-body text-fg-secondary">
        GitDojo couldn&apos;t read its certificate records, so this credential can&apos;t be
        confirmed or denied at the moment. Please try again in a few minutes.
      </p>
    </section>
  );
}
