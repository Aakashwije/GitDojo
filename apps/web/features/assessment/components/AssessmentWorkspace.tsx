"use client";

import { type AssessmentGrade, type LessonDefinition } from "@gitdojo/shared-types";
import { Button } from "@gitdojo/ui";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { ConflictBanner, ConflictEditorDialog } from "@/features/conflicts";
import { ErrorExplanation } from "@/features/errors";
import { RepositoryGraphPanel } from "@/features/repository";
import { createTerminalExecutor, terminalBanner, type TerminalHandle } from "@/features/terminal";
import {
  GitEditorDialog,
  usePracticeSession,
  WorkbenchPanel,
  WorkspaceError,
  WorkspaceFilePanels,
} from "@/features/workspace";

interface Attempt {
  id: string;
  marker: string;
  rubricVersion: number;
  criteria: string;
}

const BANNER = terminalBanner(
  ["Assessed capstone: your committed Git history is graded on the server."],
  "help",
);

function lessonFor(attempt: Attempt): LessonDefinition {
  return {
    id: `assessment-${attempt.id}`,
    slug: "git-skills-capstone",
    title: "Git practical skills capstone",
    difficulty: "advanced",
    concepts: [],
    setup: {
      initializeGit: true,
      commits: [
        {
          message: "Start GitDojo capstone",
          files: {
            ".gitdojo/attempt": attempt.marker,
            "project.txt": "shared foundation\n",
            "README.md": "# GitDojo capstone\n\nComplete the assessment criteria in the app.\n",
          },
        },
      ],
    },
    objectives: [],
  };
}

/** What a failed submission means for the learner, and what to do next. */
export function submitFailure(status: number): string {
  if (status === 401) return "Your session has ended. Sign in again, then submit.";
  if (status === 404) return "This attempt could not be found. Start a fresh attempt.";
  if (status === 400 || status === 413)
    return "This attempt's history could not be read. Start a fresh attempt.";
  if (status === 503)
    return "Grading is unavailable right now. Your work is still here, so try again in a moment.";
  return "The server could not grade this attempt. Please try again.";
}

function ActiveAssessment({
  attempt,
  onFreshAttempt,
}: {
  attempt: Attempt;
  onFreshAttempt: () => void;
}) {
  const lesson = useMemo(() => lessonFor(attempt), [attempt]);
  const { status, errorDetails, execute, files, retry, exportEvidence } =
    usePracticeSession(lesson);
  const terminalRef = useRef<TerminalHandle>(null);
  const executor = useMemo(() => createTerminalExecutor(execute), [execute]);
  const [grade, setGrade] = useState<AssessmentGrade | null>(null);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const evidence = await exportEvidence(attempt.id);
      const response = await fetch(`/api/assessment/attempts/${attempt.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence, publicNameConsent: false }),
      });
      if (!response.ok) throw new Error(submitFailure(response.status));
      const body = (await response.json()) as {
        grade: AssessmentGrade;
        credentialId: string | null;
      };
      setGrade(body.grade);
      setCredentialId(body.credentialId);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SiteHeader />
      <ConflictBanner />
      {status === "error" ? (
        <WorkspaceError details={errorDetails} onRetry={retry} />
      ) : (
        <main className="mx-auto grid w-full max-w-[1500px] gap-4 px-4 py-6 lg:grid-cols-[360px_1fr]">
          <aside className="rounded-xl border border-border bg-panel p-5">
            <p className="text-caption font-semibold tracking-widest text-accent uppercase">
              Server-graded · Rubric v{attempt.rubricVersion}
            </p>
            <h1 className="mt-2 text-h2 font-semibold text-fg">Git practical skills capstone</h1>
            <p className="mt-3 text-small text-fg-secondary">{attempt.criteria}</p>
            <ol className="mt-5 list-decimal space-y-2 pl-5 text-small text-fg-secondary">
              <li>
                Create divergent work on <code>main</code> and a feature branch.
              </li>
              <li>
                Merge the branches and resolve the conflict in <code>project.txt</code>, retaining
                the phrases <code>main perspective</code> and <code>feature perspective</code>.
              </li>
              <li>
                Commit a <code>debug.log</code> mistake, then recover so it is absent from the final
                commit. Revert and reset are both accepted.
              </li>
            </ol>
            <Button
              className="mt-6 w-full"
              disabled={status !== "ready" || submitting}
              onClick={() => void submit()}
            >
              {submitting ? "Grading…" : "Submit for server grading"}
            </Button>
            {submitError ? <p className="mt-3 text-small text-danger">{submitError}</p> : null}
            {grade ? (
              <section aria-live="polite" className="mt-5 border-t border-border pt-4">
                <h2 className="font-semibold text-fg">
                  {grade.passed ? "Assessment passed" : "Keep working"}
                </h2>
                <ul className="mt-2 space-y-2 text-small text-fg-secondary">
                  {grade.criteria.map((item) => (
                    <li key={item.id}>
                      {item.passed ? "✓" : "○"} {item.feedback}
                    </li>
                  ))}
                </ul>
                {credentialId ? (
                  <Link
                    className="mt-4 inline-block text-accent underline"
                    href={`/verify/${credentialId}`}
                  >
                    Verify assessed credential
                  </Link>
                ) : null}
                {!grade.passed ? (
                  <Button className="mt-4 w-full" variant="secondary" onClick={onFreshAttempt}>
                    Start a fresh attempt
                  </Button>
                ) : null}
              </section>
            ) : null}
          </aside>
          <div className="grid min-h-[760px] gap-4 lg:grid-cols-2 lg:grid-rows-[420px_1fr]">
            <WorkbenchPanel
              executor={executor}
              ready={status === "ready"}
              banner={BANNER}
              handleRef={terminalRef}
              files={files}
              terminalFooter={<ErrorExplanation spoilerFree />}
            />
            <RepositoryGraphPanel />
            <div className="grid gap-3 lg:col-span-2 lg:grid-cols-3">
              <WorkspaceFilePanels />
            </div>
          </div>
        </main>
      )}
      <ConflictEditorDialog readFile={files.readFile} saveFile={files.saveFile} />
      <GitEditorDialog />
    </>
  );
}

export function AssessmentWorkspace() {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/assessment/attempts", { method: "POST" });
      if (response.status === 401) throw new Error("Sign in to start an assessed attempt.");
      if (!response.ok) throw new Error("The assessment service is unavailable.");
      setAttempt((await response.json()) as Attempt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start the assessment.");
    } finally {
      setLoading(false);
    }
  };
  if (attempt)
    return (
      <ActiveAssessment
        attempt={attempt}
        onFreshAttempt={() => {
          setAttempt(null);
        }}
      />
    );
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <p className="text-small font-semibold tracking-widest text-accent uppercase">
          Assessed credential
        </p>
        <h1 className="mt-3 text-h1 font-semibold text-fg">Git practical skills capstone</h1>
        <p className="mt-4 text-body text-fg-secondary">
          Demonstrate branching, commits, conflict resolution and recovery in an isolated
          repository. GitDojo grades the canonical Git object history on the server; lesson and
          Practice completion records are not used as evidence.
        </p>
        <div className="mt-8 rounded-xl border border-border bg-panel p-6">
          <h2 className="text-h3 font-semibold text-fg">Before you begin</h2>
          <p className="mt-2 text-small text-fg-secondary">
            Each attempt receives a unique starter commit and rubric version. Failed checks explain
            the skill to revisit without revealing an exact command sequence.
          </p>
          <Button className="mt-5" disabled={loading} onClick={() => void start()}>
            {loading ? "Starting…" : "Start a new attempt"}
          </Button>
          {error ? (
            <p className="mt-3 text-small text-danger">
              {error}{" "}
              <Link href="/sign-in" className="underline">
                Sign in
              </Link>
            </p>
          ) : null}
        </div>
      </main>
    </>
  );
}
