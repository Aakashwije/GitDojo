"use client";

import { type LocalProgress, type ProgressCatalog } from "@gitdojo/progress";
import { Badge, Button, cn } from "@gitdojo/ui";
import {
  ArrowRight,
  Award,
  CircleCheck,
  Download,
  ExternalLink,
  LoaderCircle,
  ShieldX,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { AWARDS, awardKeys, type AwardKey } from "@/lib/certificates/awards";
import { syncCompletionsNow, syncNow, useProgressStore } from "@/features/progress";
import { awardProgress, type AwardProgress } from "../services/award-progress";

interface Issued {
  id: string;
  awardKey: AwardKey;
  criteriaVersion: number;
  recipientName: string;
  issuedAt: string;
  revoked: boolean;
  publicNameConsent: boolean;
}

const ISSUED_DATE = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" });

export function CertificateAwards({
  progress,
  catalog,
}: {
  progress: LocalProgress;
  catalog: ProgressCatalog;
}) {
  const mode = useProgressStore((state) => state.mode);
  const accountId = progress.owner.kind === "account" ? progress.owner.accountId : null;
  const [issuedState, setIssuedState] = useState<{ accountId: string; items: Issued[] } | null>(
    null,
  );
  const issued = issuedState?.accountId === accountId ? issuedState.items : null;
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<AwardKey | null>(null);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  // The award issued in this visit, for its brief unlock moment.
  const [unlocked, setUnlocked] = useState<AwardKey | null>(null);
  const consentName = useId();
  const account = mode === "account" && accountId !== null;

  useEffect(() => {
    if (mode !== "account" || !accountId) return;
    let active = true;
    void fetch("/api/certificates", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load certificates.");
        return response.json() as Promise<{ certificates: Issued[] }>;
      })
      .then(({ certificates }) => {
        if (active) setIssuedState({ accountId, items: certificates });
      })
      .catch(() => {
        if (!active) return;
        setLoadFailed(true);
        setMessage("Certificates are temporarily unavailable.");
      });
    return () => {
      active = false;
    };
  }, [mode, accountId]);

  async function issue(key: AwardKey) {
    if (busy) return;
    setBusy(key);
    setMessage("");
    try {
      await syncCompletionsNow();
      await syncNow();
      const response = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ awardKey: key, publicNameConsent: consent }),
      });
      const result = (await response.json()) as {
        id?: string;
        error?: string;
        missing?: string[];
        message?: string;
      };
      if (!response.ok || !result.id) {
        setMessage(
          result.error === "not_eligible"
            ? "Some completions have not reached your account yet. Sync your progress and try again."
            : (result.message ?? "Could not issue this certificate right now."),
        );
        return;
      }
      const refreshed = await fetch("/api/certificates", { cache: "no-store" });
      if (refreshed.ok) {
        const data = (await refreshed.json()) as { certificates: Issued[] };
        if (accountId) setIssuedState({ accountId, items: data.certificates });
      }
      setUnlocked(key);
      setMessage(`${AWARDS[key].title} certificate issued.`);
    } catch {
      setMessage("Could not issue this certificate right now.");
    } finally {
      setBusy(null);
    }
  }

  const awards = awardKeys.map((key) => {
    const award = AWARDS[key];
    const item = issued?.find(
      (candidate) =>
        candidate.awardKey === key && candidate.criteriaVersion === award.criteriaVersion,
    );
    return { key, award, item, status: awardProgress(key, progress, catalog) };
  });
  const issuable = awards.some(({ item, status }) => !item && status.remaining === 0);

  return (
    <section
      aria-labelledby="certificates-heading"
      data-testid="certificates"
      className="rounded-xl border border-border-subtle bg-surface p-5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <Award className="size-5 text-accent" aria-hidden="true" />
        <h2 id="certificates-heading" className="text-h3 font-semibold text-fg">
          Completion certificates
        </h2>
      </div>
      <p className="mt-2 max-w-3xl text-small text-fg-secondary">
        Finish each set of lessons and Practice tasks to receive a GitDojo completion certificate.
        These awards record learner-reported progress in GitDojo; they are not an assessment of Git
        proficiency.
      </p>
      {mode === "anonymous" ? (
        <p className="mt-3 text-small text-fg-secondary" data-testid="certificates-sign-in">
          Sign in to receive verifiable certificates. Certificates count your account&apos;s
          completions, so work done while signed out doesn&apos;t count towards them.
        </p>
      ) : mode === "account-unavailable" ? (
        <p className="mt-3 text-small text-fg-secondary" data-testid="certificates-unavailable">
          Your account can&apos;t be reached right now, so certificates can&apos;t be shown or
          issued. The progress below is from this visit.
        </p>
      ) : null}

      {account && issuable ? (
        <fieldset className="mt-5 rounded-lg border border-border bg-panel p-4">
          <legend className="px-1 text-small font-semibold text-fg">
            Your name on the certificate you issue
          </legend>
          <p className="text-caption text-fg-muted">
            Your downloaded PDF always shows your account profile name. This choice is about what
            others see when they open your verification link or badge.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <ConsentOption
              name={consentName}
              checked={!consent}
              onSelect={() => {
                setConsent(false);
              }}
              title="Keep my name private"
              detail="The verification page says “Name withheld by learner” and the badge has no name."
            />
            <ConsentOption
              name={consentName}
              checked={consent}
              onSelect={() => {
                setConsent(true);
              }}
              title="Show my name publicly"
              detail="Your profile name appears on the public verification page and in the Open Badge."
            />
          </div>
          <p className="mt-3 text-caption text-fg-muted">
            The choice is fixed for each certificate once it is issued, and copies you have shared
            can&apos;t be recalled.
          </p>
        </fieldset>
      ) : null}

      <ul className="mt-5 grid gap-4 lg:grid-cols-3">
        {awards.map(({ key, award, item, status }) => (
          <li
            key={key}
            data-testid="certificate"
            data-award={key}
            data-state={
              item
                ? item.revoked
                  ? "revoked"
                  : "issued"
                : status.remaining === 0
                  ? "ready"
                  : "in-progress"
            }
            className={cn(
              "flex flex-col rounded-lg border bg-panel p-4 transition-colors duration-200 ease-out",
              item && !item.revoked ? "border-success/40" : "border-border",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-fg">{award.title}</h3>
              <AwardBadge item={item} status={status} unlocked={unlocked === key} />
            </div>
            <Requirements status={status} title={award.title} />
            <p className="mt-1 text-caption text-fg-muted">
              {award.lessons.length} lessons · {award.practice.length} Practice{" "}
              {award.practice.length === 1 ? "task" : "tasks"} · criteria v{award.criteriaVersion}
            </p>

            <div className="mt-auto pt-4">
              {item ? (
                <Earned item={item} unlocked={unlocked === key} />
              ) : status.next ? (
                <p className="text-small text-fg-secondary" data-testid="certificate-next">
                  <span className="text-fg-muted">Next: </span>
                  {status.next.href ? (
                    <Link
                      href={status.next.href}
                      className="group inline-flex items-center gap-1 font-medium text-accent hover:underline"
                    >
                      {status.next.title}
                      <ArrowRight
                        className="size-3.5 transition-transform duration-150 ease-out motion-safe:group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                  ) : (
                    <span className="font-medium text-fg">{status.next.title}</span>
                  )}
                  <span className="text-fg-muted">
                    {" "}
                    · {status.next.kind === "lesson" ? "Lesson" : "Practice task"}
                  </span>
                </p>
              ) : account ? (
                <Button
                  variant="primary"
                  disabled={busy !== null || issued === null}
                  onClick={() => {
                    void issue(key);
                  }}
                >
                  {busy === key ? (
                    <>
                      <LoaderCircle className="animate-spin" aria-hidden="true" /> Issuing…
                    </>
                  ) : issued === null && !loadFailed ? (
                    "Checking…"
                  ) : (
                    "Issue certificate"
                  )}
                </Button>
              ) : (
                <p className="text-small text-fg-secondary">
                  All requirements done in this browser.
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p role="status" className="mt-4 min-h-5 text-small text-fg-secondary">
        {message}
      </p>
    </section>
  );
}

function ConsentOption({
  name,
  checked,
  onSelect,
  title,
  detail,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-2.5 rounded-md border p-3 transition-colors duration-150 ease-out",
        checked ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-1" />
      <span>
        <span className="block text-small font-medium text-fg">{title}</span>
        <span className="block text-caption text-fg-muted">{detail}</span>
      </span>
    </label>
  );
}

function Requirements({ status, title }: { status: AwardProgress; title: string }) {
  return (
    <div className="mt-3">
      <p className="flex items-baseline justify-between gap-3 text-small text-fg-secondary">
        <span data-testid="certificate-count">
          <span className="font-mono font-semibold text-fg">{status.done}</span> of{" "}
          <span className="font-mono">{status.total}</span> requirements
        </span>
        <span className="text-caption text-fg-muted">
          {status.remaining === 0 ? "All done" : `${String(status.remaining)} left`}
        </span>
      </p>
      <div
        role="progressbar"
        aria-label={`${title} requirements`}
        aria-valuetext={`${String(status.done)} of ${String(status.total)} requirements`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status.percent}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-border-strong"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            status.remaining === 0 ? "bg-success" : "bg-accent",
          )}
          style={{ width: `${String(status.percent)}%` }}
        />
      </div>
    </div>
  );
}

function AwardBadge({
  item,
  status,
  unlocked,
}: {
  item?: Issued;
  status: AwardProgress;
  unlocked: boolean;
}) {
  if (item?.revoked) {
    return (
      <Badge tone="danger">
        <ShieldX aria-hidden="true" /> Revoked
      </Badge>
    );
  }
  if (item) {
    return (
      <Badge tone="success" className={unlocked ? "animate-gd-pop" : undefined}>
        <CircleCheck aria-hidden="true" /> Earned
      </Badge>
    );
  }
  return status.remaining === 0 ? <Badge tone="accent">Ready</Badge> : <Badge>In progress</Badge>;
}

function Earned({ item, unlocked }: { item: Issued; unlocked: boolean }) {
  return (
    <div className={unlocked ? "animate-gd-enter" : undefined} data-testid="certificate-earned">
      <p className="text-small text-fg-secondary">
        {item.revoked ? "Issued, then revoked by GitDojo" : "Issued"}{" "}
        <time dateTime={item.issuedAt} className="font-medium text-fg">
          {ISSUED_DATE.format(new Date(item.issuedAt))}
        </time>
      </p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-small">
        <a
          className="inline-flex items-center gap-1 text-accent underline"
          href={`/api/certificates/${item.id}/pdf`}
        >
          <Download className="size-3.5" aria-hidden="true" />
          PDF
        </a>
        <a
          className="inline-flex items-center gap-1 text-accent underline"
          href={`/api/credentials/${item.id}`}
        >
          <Download className="size-3.5" aria-hidden="true" />
          Open Badge
        </a>
        <a
          className="inline-flex items-center gap-1 text-accent underline"
          href={`/verify/${item.id}`}
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Verify
        </a>
      </div>
      <p className="mt-2 text-caption text-fg-muted">
        Name on the public page: {item.publicNameConsent ? "shown" : "withheld"}
      </p>
    </div>
  );
}
