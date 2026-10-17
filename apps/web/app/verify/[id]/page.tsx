import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site/site-header";
import { CredentialRecord } from "@/features/certificates/components/CredentialRecord";
import { CredentialUnavailable } from "@/features/certificates/components/CredentialMissing";
import { formatCredentialDate } from "@/lib/certificates/public-view";
import { lookupCredential } from "@/lib/certificates/verification";

/** Verification pages are for people holding a link, never for search results. */
const PRIVATE_PAGE = { index: false, follow: false, nocache: true } as const;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const lookup = await lookupCredential((await params).id);
  if (lookup.status !== "found") {
    return {
      title: lookup.status === "not-found" ? "Credential not found" : "Verification unavailable",
      robots: PRIVATE_PAGE,
    };
  }
  const { certificate } = lookup;
  const status = certificate.revokedAt ? "Revoked" : "Valid";
  const title = `${certificate.title} completion certificate (${status})`;
  // The holder's name only when they chose to show it publicly, as on the page itself.
  const holder = certificate.holderName ? ` to ${certificate.holderName}` : "";
  const description = `${status}: a GitDojo completion certificate issued${holder} on ${formatCredentialDate(certificate.issuedAt)} (UTC).`;
  return {
    title,
    description,
    robots: PRIVATE_PAGE,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function VerifyPage({ params }: Props) {
  // Read the record on every request, so a revocation shows at once.
  await connection();
  const lookup = await lookupCredential((await params).id);
  if (lookup.status === "not-found") notFound();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[calc(100dvh-3.5rem)] max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        {lookup.status === "found" ? (
          <CredentialRecord
            certificate={lookup.certificate}
            lessons={lookup.lessons}
            practice={lookup.practice}
            checkedAt={lookup.checkedAt}
          />
        ) : (
          <CredentialUnavailable />
        )}
      </main>
    </>
  );
}
