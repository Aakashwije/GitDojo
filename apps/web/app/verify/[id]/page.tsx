import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site/site-header";
import { CredentialRecord } from "@/features/certificates/components/CredentialRecord";
import { CredentialUnavailable } from "@/features/certificates/components/CredentialMissing";
import { formatCredentialDate } from "@/lib/certificates/public-view";
import { lookupCredential } from "@/lib/certificates/verification";
import { findCertificate } from "@/lib/certificates/store";

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
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const certificate = await findCertificate(id);
  if (!certificate) notFound();
  const award = certificate.evidence;
  const revoked = certificate.revokedAt !== null;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <p className="text-small font-semibold tracking-widest text-accent uppercase">
          GitDojo credential verification
        </p>
        <h1 className="mt-3 text-h1 font-semibold text-fg">{award.title}</h1>
        <p className="mt-2 text-body text-fg-secondary">
          {certificate.credentialKind === "assessed"
            ? "Server-graded skills credential"
            : "Completion certificate"}
        </p>
        <div
          className={`mt-8 rounded-xl border p-5 ${revoked ? "border-danger text-danger" : "border-success text-success"}`}
        >
          <strong className="text-h3">{revoked ? "Revoked" : "Valid"}</strong>
          <p className="mt-1 text-small">
            {revoked
              ? "GitDojo has revoked this credential."
              : "This credential is present in GitDojo’s issuance records."}
          </p>
        </div>
        <dl className="mt-8 grid gap-5 rounded-xl border border-border bg-panel p-6 sm:grid-cols-2">
          <div>
            <dt className="text-small text-fg-muted">Issuer</dt>
            <dd className="mt-1 font-medium text-fg">GitDojo</dd>
          </div>
          <div>
            <dt className="text-small text-fg-muted">Recipient</dt>
            <dd className="mt-1 font-medium text-fg">
              {certificate.publicNameConsent
                ? certificate.recipientName
                : "Name withheld by learner"}
            </dd>
          </div>
          <div>
            <dt className="text-small text-fg-muted">Issued</dt>
            <dd className="mt-1 text-fg">{certificate.issuedAt.toISOString().slice(0, 10)}</dd>
          </div>
          <div>
            <dt className="text-small text-fg-muted">Credential ID</dt>
            <dd className="mt-1 font-mono text-small break-all text-fg">{certificate.id}</dd>
          </div>
          <div>
            <dt className="text-small text-fg-muted">Criteria version</dt>
            <dd className="mt-1 text-fg">{certificate.criteriaVersion}</dd>
          </div>
          <div>
            <dt className="text-small text-fg-muted">Credential format</dt>
            <dd className="mt-1 text-fg">
              {certificate.credentialKind === "assessed"
                ? "Assessed skills credential and signed Open Badge"
                : "Completion certificate and signed Open Badge"}
            </dd>
          </div>
        </dl>
        <section className="mt-8 rounded-xl border border-border bg-panel p-6">
          <h2 className="text-h3 font-semibold text-fg">Award criteria</h2>
          <p className="mt-2 text-body text-fg-secondary">{award.criteria}</p>
          {award.kind === "assessed" ? (
            <>
              <h3 className="mt-6 font-semibold text-fg">Server grade</h3>
              <ul className="mt-2 space-y-2 text-small text-fg-secondary">
                {award.grade.criteria.map((criterion) => (
                  <li key={criterion.id}>
                    <strong>{criterion.passed ? "Passed" : "Not passed"}:</strong>{" "}
                    {criterion.feedback}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-small text-fg-muted">
                Evidence: canonical Git objects and commit history from isolated attempt{" "}
                {award.attemptId}.
              </p>
            </>
          ) : (
            <>
              <h3 className="mt-6 font-semibold text-fg">Required lessons</h3>
              <ul className="mt-2 grid list-disc gap-1 pl-5 text-small text-fg-secondary sm:grid-cols-2">
                {award.lessons.map((lesson) => (
                  <li key={lesson}>{lesson.replaceAll("-", " ")}</li>
                ))}
              </ul>
              <h3 className="mt-6 font-semibold text-fg">Required practice tasks</h3>
              <ul className="mt-2 list-disc pl-5 text-small text-fg-secondary">
                {award.practice.map((task) => (
                  <li key={task}>{task.replaceAll("-", " ")}</li>
                ))}
              </ul>
            </>
          )}
        </section>
        <p className="mt-6 text-small text-fg-muted">
          {certificate.credentialKind === "assessed"
            ? "GitDojo independently graded the submitted Git history. The account profile name has not been independently identity-verified."
            : "GitDojo records these completions from the learner’s account. Exercise outcomes and the account profile name have not been independently verified by GitDojo."}
        </p>
        <a
          className="mt-6 inline-block text-accent underline"
          href={`/api/credentials/${certificate.id}`}
        >
          Download signed Open Badge
        </a>
      </main>
    </>
  );
}
