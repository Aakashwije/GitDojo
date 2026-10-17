import { connection } from "next/server";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { isAwardKey } from "@/lib/certificates/awards";
import { findCertificate } from "@/lib/certificates/store";

export const metadata = { title: "Verify a GitDojo certificate" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const certificate = await findCertificate(id);
  if (!certificate || !isAwardKey(certificate.awardKey)) notFound();
  const award = certificate.evidence;
  const revoked = certificate.revokedAt !== null;
  return <>
    <SiteHeader />
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-small font-semibold uppercase tracking-widest text-accent">GitDojo credential verification</p>
      <h1 className="mt-3 text-h1 font-semibold text-fg">{award.title}</h1>
      <p className="mt-2 text-body text-fg-secondary">Completion certificate</p>
      <div className={`mt-8 rounded-xl border p-5 ${revoked ? "border-danger text-danger" : "border-success text-success"}`}>
        <strong className="text-h3">{revoked ? "Revoked" : "Valid"}</strong>
        <p className="mt-1 text-small">{revoked ? "GitDojo has revoked this credential." : "This credential is present in GitDojo’s issuance records."}</p>
      </div>
      <dl className="mt-8 grid gap-5 rounded-xl border border-border bg-panel p-6 sm:grid-cols-2">
        <div><dt className="text-small text-fg-muted">Issuer</dt><dd className="mt-1 font-medium text-fg">GitDojo</dd></div>
        <div><dt className="text-small text-fg-muted">Recipient</dt><dd className="mt-1 font-medium text-fg">{certificate.publicNameConsent ? certificate.recipientName : "Name withheld by learner"}</dd></div>
        <div><dt className="text-small text-fg-muted">Issued</dt><dd className="mt-1 text-fg">{certificate.issuedAt.toISOString().slice(0, 10)}</dd></div>
        <div><dt className="text-small text-fg-muted">Credential ID</dt><dd className="mt-1 break-all font-mono text-small text-fg">{certificate.id}</dd></div>
        <div><dt className="text-small text-fg-muted">Criteria version</dt><dd className="mt-1 text-fg">{certificate.criteriaVersion}</dd></div>
        <div><dt className="text-small text-fg-muted">Credential format</dt><dd className="mt-1 text-fg">Completion certificate and signed Open Badge</dd></div>
      </dl>
      <section className="mt-8 rounded-xl border border-border bg-panel p-6">
        <h2 className="text-h3 font-semibold text-fg">Award criteria</h2>
        <p className="mt-2 text-body text-fg-secondary">{award.criteria}</p>
        <h3 className="mt-6 font-semibold text-fg">Required lessons</h3>
        <ul className="mt-2 grid list-disc gap-1 pl-5 text-small text-fg-secondary sm:grid-cols-2">
          {award.lessons.map((lesson) => <li key={lesson}>{lesson.replaceAll("-", " ")}</li>)}
        </ul>
        <h3 className="mt-6 font-semibold text-fg">Required practice tasks</h3>
        <ul className="mt-2 list-disc pl-5 text-small text-fg-secondary">
          {award.practice.map((task) => <li key={task}>{task.replaceAll("-", " ")}</li>)}
        </ul>
      </section>
      <p className="mt-6 text-small text-fg-muted">GitDojo records these completions from the learner’s account. Exercise outcomes and the account profile name have not been independently verified by GitDojo.</p>
      <a className="mt-6 inline-block text-accent underline" href={`/api/credentials/${certificate.id}`}>Download signed Open Badge</a>
    </main>
  </>;
}
