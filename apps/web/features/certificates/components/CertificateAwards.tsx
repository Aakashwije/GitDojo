"use client";

import { completedLessonIds, solvedPracticeIds, type LocalProgress } from "@gitdojo/progress";
import { Button } from "@gitdojo/ui";
import { Award, Download, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { AWARDS, awardKeys, type AwardKey } from "@/lib/certificates/awards";
import { syncCompletionsNow, syncNow, useProgressStore } from "@/features/progress";

interface Issued {
  id: string;
  awardKey: AwardKey;
  criteriaVersion: number;
  recipientName: string;
  issuedAt: string;
  revoked: boolean;
  publicNameConsent: boolean;
}

export function CertificateAwards({ progress }: { progress: LocalProgress }) {
  const mode = useProgressStore((state) => state.mode);
  const accountId = progress.owner.kind === "account" ? progress.owner.accountId : null;
  const [issuedState, setIssuedState] = useState<{ accountId: string; items: Issued[] } | null>(
    null,
  );
  const issued = issuedState?.accountId === accountId ? issuedState.items : null;
  const [busy, setBusy] = useState<AwardKey | null>(null);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const lessons = completedLessonIds(progress);
  const practice = solvedPracticeIds(progress);

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
        if (active) setMessage("Certificates are temporarily unavailable.");
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
      setMessage(`${AWARDS[key].title} certificate issued.`);
    } catch {
      setMessage("Could not issue this certificate right now.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-labelledby="certificates-heading"
      className="rounded-xl border border-border-subtle bg-surface p-5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <Award className="size-5 text-accent" aria-hidden="true" />
        <h2 id="certificates-heading" className="text-h3 font-semibold text-fg">
          Completion certificates
        </h2>
      </div>
      <p className="mt-2 text-small text-fg-secondary">
        Finish each set of lessons and Practice tasks to receive a GitDojo completion certificate.
        These awards reflect learner-reported progress.
      </p>
      {mode !== "account" ? (
        <p className="mt-4 text-small text-fg-secondary">
          Sign in and sync your progress to receive a verifiable certificate.
        </p>
      ) : (
        <>
          <label className="mt-5 flex items-start gap-2 text-small text-fg-secondary">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => {
                setConsent(event.target.checked);
              }}
              className="mt-1"
            />
            Show my account profile name on the public verification page and in downloadable badges.
            This choice is fixed for the issued credential; shared copies cannot be recalled.
          </label>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {awardKeys.map((key) => {
              const award = AWARDS[key];
              const done =
                award.lessons.filter((id) => lessons.has(id)).length +
                award.practice.filter((id) => practice.has(id)).length;
              const total = award.lessons.length + award.practice.length;
              const item = issued?.find(
                (candidate) =>
                  candidate.awardKey === key && candidate.criteriaVersion === award.criteriaVersion,
              );
              return (
                <div key={key} className="rounded-lg border border-border bg-panel p-4">
                  <h3 className="font-semibold text-fg">{award.title}</h3>
                  <p className="mt-2 text-small text-fg-secondary">
                    {done} of {total} requirements recorded
                  </p>
                  <p className="mt-1 text-small text-fg-muted">
                    {award.lessons.length} lessons · {award.practice.length} practice tasks ·
                    criteria v{award.criteriaVersion}
                  </p>
                  {item ? (
                    <>
                      <p className="mt-3 text-small font-medium text-fg">
                        {item.revoked ? "Revoked" : "Issued"} · {item.issuedAt.slice(0, 10)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3 text-small">
                        <a
                          className="text-accent underline"
                          href={`/api/certificates/${item.id}/pdf`}
                        >
                          <Download className="mr-1 inline size-3" />
                          PDF
                        </a>
                        <a className="text-accent underline" href={`/api/credentials/${item.id}`}>
                          <Download className="mr-1 inline size-3" />
                          Open Badge
                        </a>
                        <a className="text-accent underline" href={`/verify/${item.id}`}>
                          <ExternalLink className="mr-1 inline size-3" />
                          Verify
                        </a>
                      </div>
                      <p className="mt-3 text-small text-fg-muted">
                        Public name: {item.publicNameConsent ? "shown" : "hidden"}
                      </p>
                    </>
                  ) : (
                    <Button
                      className="mt-4"
                      variant="secondary"
                      disabled={done < total || busy !== null || issued === null}
                      onClick={() => {
                        void issue(key);
                      }}
                    >
                      {busy === key ? "Issuing…" : "Issue certificate"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {message && (
        <p role="status" className="mt-4 text-small text-fg-secondary">
          {message}
        </p>
      )}
    </section>
  );
}
