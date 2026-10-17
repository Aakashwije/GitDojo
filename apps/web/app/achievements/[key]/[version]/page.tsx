import { notFound } from "next/navigation";
import { CAPSTONE_KEY, CAPSTONE_RUBRIC_VERSION } from "@gitdojo/shared-types";
import { SiteHeader } from "@/components/site/site-header";
import { AWARDS, criteriaNarrative, isAwardKey } from "@/lib/certificates/awards";
import { CAPSTONE_CRITERIA, CAPSTONE_DESCRIPTION, CAPSTONE_TITLE } from "@/lib/assessment/rubric";

export default async function AchievementPage({
  params,
}: {
  params: Promise<{ key: string; version: string }>;
}) {
  const { key, version } = await params;
  if (key === CAPSTONE_KEY && version === `v${CAPSTONE_RUBRIC_VERSION}`) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <p className="text-small font-semibold tracking-widest text-accent uppercase">
            Server-graded achievement
          </p>
          <h1 className="mt-3 text-h1 font-semibold text-fg">{CAPSTONE_TITLE}</h1>
          <p className="mt-3 text-body text-fg-secondary">{CAPSTONE_DESCRIPTION}</p>
          <p className="mt-6 text-body text-fg-secondary">{CAPSTONE_CRITERIA}</p>
          <p className="mt-8 text-small text-fg-muted">
            Rubric version {CAPSTONE_RUBRIC_VERSION}. GitDojo verifies canonical Git objects and
            grades the resulting history on the server.
          </p>
        </main>
      </>
    );
  }
  if (!isAwardKey(key) || version !== `v${AWARDS[key].criteriaVersion}`) notFound();
  const award = AWARDS[key];
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-h1 font-semibold text-fg">{award.title}</h1>
        <p className="mt-3 text-body text-fg-secondary">{award.description}</p>
        <p className="mt-6 text-body text-fg-secondary">{criteriaNarrative(key)}</p>
        <h2 className="mt-8 text-h3 font-semibold text-fg">Required lessons</h2>
        <ul className="mt-3 list-disc pl-5 text-fg-secondary">
          {award.lessons.map((id) => (
            <li key={id}>{id.replaceAll("-", " ")}</li>
          ))}
        </ul>
        <h2 className="mt-8 text-h3 font-semibold text-fg">Required practice</h2>
        <ul className="mt-3 list-disc pl-5 text-fg-secondary">
          {award.practice.map((id) => (
            <li key={id}>{id.replaceAll("-", " ")}</li>
          ))}
        </ul>
        <p className="mt-8 text-small text-fg-muted">
          Criteria version {award.criteriaVersion}. GitDojo completion records are learner-reported.
        </p>
      </main>
    </>
  );
}
