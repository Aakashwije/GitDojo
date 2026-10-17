import { Badge, cn } from "@gitdojo/ui";
import {
  Award,
  BookOpen,
  Download,
  EyeOff,
  FileCheck,
  Info,
  ShieldCheck,
  ShieldX,
  Target,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";
import {
  formatCredentialDate,
  formatCredentialTime,
  NAME_WITHHELD,
  type PublicCertificate,
} from "@/lib/certificates/public-view";

export interface CredentialRequirement {
  id: string;
  title: string;
  course?: string;
}

/**
 * The public record of one completion certificate: its live status first, then who holds it,
 * when it was issued and what it was awarded for. Only {@link PublicCertificate} fields reach it,
 * so private account data cannot be rendered by mistake.
 */
export function CredentialRecord({
  certificate,
  lessons,
  practice,
  checkedAt,
}: {
  certificate: PublicCertificate;
  lessons: CredentialRequirement[];
  practice: CredentialRequirement[];
  checkedAt: Date;
}) {
  const revoked = certificate.revokedAt !== null;
  return (
    <article aria-labelledby="credential-title" data-testid="credential">
      <p className="flex items-center gap-2 text-small font-semibold tracking-wider text-accent uppercase">
        <FileCheck className="size-4" aria-hidden="true" />
        GitDojo credential verification
      </p>
      <h1
        id="credential-title"
        className="mt-3 text-h2 font-bold tracking-tight text-fg sm:text-h1"
      >
        {certificate.title}
      </h1>
      <p className="mt-2 text-body-lg text-fg-secondary">
        Completion certificate issued by GitDojo
      </p>

      <StatusPanel certificate={certificate} checkedAt={checkedAt} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section
          aria-labelledby="details-heading"
          className="rounded-xl border border-border bg-panel p-5 sm:p-6"
        >
          <h2 id="details-heading" className="text-h4 font-semibold text-fg">
            Certificate details
          </h2>
          <dl className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <Detail label="Awarded to" wide>
              {certificate.holderName ? (
                <span className="text-h4 font-semibold text-fg" data-testid="credential-holder">
                  {certificate.holderName}
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-2 text-fg-secondary"
                  data-testid="credential-holder"
                >
                  <EyeOff className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                  {NAME_WITHHELD}
                </span>
              )}
            </Detail>
            <Detail label="Issued by">GitDojo</Detail>
            <Detail label="Issued on">
              <time dateTime={certificate.issuedAt.toISOString()} data-testid="credential-issued">
                {formatCredentialTime(certificate.issuedAt)}
              </time>
            </Detail>
            <Detail label="Credential ID" wide>
              <span className="font-mono text-small break-all" data-testid="credential-id">
                {certificate.id}
              </span>
            </Detail>
            <Detail label="Criteria version">Version {certificate.criteriaVersion}</Detail>
            <Detail label="Type">Completion certificate</Detail>
          </dl>
        </section>

        <aside
          aria-labelledby="checking-heading"
          className="rounded-xl border border-border bg-panel p-5 sm:p-6"
        >
          <h2 id="checking-heading" className="text-h4 font-semibold text-fg">
            How this is checked
          </h2>
          <p className="mt-3 text-small text-fg-secondary">
            This page reads GitDojo&apos;s issuance record each time it is opened, so its status is
            current even if a PDF or link was shared long ago.
          </p>
          <p className="mt-3 text-small text-fg-secondary">
            For a cryptographic check, the signed Open Badge can be verified with GitDojo&apos;s
            published key and revocation list. A link or QR code on its own is not a signature.
          </p>
          {revoked ? null : (
            <a
              href={`/api/credentials/${certificate.id}`}
              className="mt-4 inline-flex items-center gap-1.5 text-small font-medium text-accent hover:underline"
            >
              <Download className="size-4" aria-hidden="true" />
              Download the signed Open Badge
            </a>
          )}
        </aside>
      </div>

      <section
        aria-labelledby="criteria-heading"
        className="mt-6 rounded-xl border border-border bg-panel p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="criteria-heading" className="text-h4 font-semibold text-fg">
            What it was awarded for
          </h2>
          <Badge>Criteria v{certificate.criteriaVersion}</Badge>
        </div>
        <p className="mt-3 max-w-3xl text-body text-fg-secondary">{certificate.criteria}</p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <RequirementList
            id="lessons-heading"
            icon={BookOpen}
            title={`Lessons (${String(lessons.length)})`}
            items={lessons}
          />
          <RequirementList
            id="practice-heading"
            icon={Target}
            title={`Practice tasks (${String(practice.length)})`}
            items={practice}
          />
        </div>
        <p className="mt-6 text-small">
          <Link
            href={`/achievements/${certificate.awardKey}/v${String(certificate.criteriaVersion)}`}
            className="text-accent hover:underline"
          >
            About the {certificate.title} award
          </Link>
        </p>
      </section>

      <section
        aria-labelledby="meaning-heading"
        className="mt-6 flex gap-3 rounded-xl border border-border-subtle bg-surface p-5 sm:p-6"
      >
        <Info className="mt-0.5 size-5 shrink-0 text-fg-muted" aria-hidden="true" />
        <div>
          <h2 id="meaning-heading" className="text-body font-semibold text-fg">
            What a completion certificate means
          </h2>
          <p className="mt-2 text-small text-fg-secondary">
            It records that the holder&apos;s GitDojo account completed the lessons and Practice
            tasks above. Completions are learner-reported and exercise outcomes are not
            independently graded, so it is not proof of assessed Git proficiency. The holder&apos;s
            name comes from their account profile and is not an identity check.
          </p>
        </div>
      </section>
    </article>
  );
}

function StatusPanel({
  certificate,
  checkedAt,
}: {
  certificate: PublicCertificate;
  checkedAt: Date;
}) {
  const revokedAt = certificate.revokedAt;
  const Icon = revokedAt ? ShieldX : ShieldCheck;
  return (
    <section
      aria-labelledby="status-heading"
      data-testid="credential-status"
      data-status={revokedAt ? "revoked" : "valid"}
      className={cn(
        "mt-8 flex flex-col gap-4 rounded-xl border-2 p-5 sm:flex-row sm:items-center sm:p-6",
        revokedAt ? "border-danger/60 bg-danger-soft" : "border-success/60 bg-success-soft",
      )}
    >
      <Icon
        className={cn("size-12 shrink-0", revokedAt ? "text-danger" : "text-success")}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <h2 id="status-heading" className="text-small font-medium text-fg-secondary">
          Certificate status
        </h2>
        <p
          className={cn(
            "text-h2 font-bold tracking-tight",
            revokedAt ? "text-danger" : "text-success",
          )}
          data-testid="credential-status-label"
        >
          {revokedAt ? "Revoked" : "Valid"}
        </p>
        <p className="mt-1 text-body text-fg">
          {revokedAt ? (
            <>
              GitDojo revoked this certificate on {formatCredentialDate(revokedAt)} (UTC). It is no
              longer valid, including any PDF or Open Badge shared before then.
            </>
          ) : (
            <>This certificate is in GitDojo&apos;s issuance records and has not been revoked.</>
          )}
        </p>
        <p className="mt-1 text-caption text-fg-muted">
          Checked against GitDojo&apos;s records on{" "}
          <time dateTime={checkedAt.toISOString()}>{formatCredentialTime(checkedAt)}</time>.
        </p>
      </div>
      <Award
        className={cn(
          "hidden size-10 shrink-0 sm:ml-auto sm:block",
          revokedAt ? "text-fg-faint" : "text-success/70",
        )}
        aria-hidden="true"
      />
    </section>
  );
}

function Detail({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-caption font-medium tracking-wide text-fg-muted uppercase">{label}</dt>
      <dd className="mt-1 text-body text-fg">{children}</dd>
    </div>
  );
}

function RequirementList({
  id,
  icon: Icon,
  title,
  items,
}: {
  id: string;
  icon: typeof BookOpen;
  title: string;
  items: CredentialRequirement[];
}) {
  return (
    <div>
      <h3 id={id} className="flex items-center gap-2 text-small font-semibold text-fg">
        <Icon className="size-4 text-fg-muted" aria-hidden="true" />
        {title}
      </h3>
      <ol aria-labelledby={id} className="mt-3 space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex gap-2 text-small">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-fg-faint" aria-hidden="true" />
            <span>
              <span className="text-fg">{item.title}</span>
              {item.course ? <span className="text-fg-muted"> · {item.course}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
