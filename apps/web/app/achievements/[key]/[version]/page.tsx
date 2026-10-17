import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { AWARDS, criteriaNarrative, isAwardKey } from "@/lib/certificates/awards";

export default async function AchievementPage({ params }: { params: Promise<{ key: string; version: string }> }) {
  const { key, version } = await params;
  if (!isAwardKey(key) || version !== `v${AWARDS[key].criteriaVersion}`) notFound();
  const award = AWARDS[key];
  return <>
    <SiteHeader />
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-h1 font-semibold text-fg">{award.title}</h1>
      <p className="mt-3 text-body text-fg-secondary">{award.description}</p>
      <p className="mt-6 text-body text-fg-secondary">{criteriaNarrative(key)}</p>
      <h2 className="mt-8 text-h3 font-semibold text-fg">Required lessons</h2>
      <ul className="mt-3 list-disc pl-5 text-fg-secondary">{award.lessons.map((id) => <li key={id}>{id.replaceAll("-", " ")}</li>)}</ul>
      <h2 className="mt-8 text-h3 font-semibold text-fg">Required practice</h2>
      <ul className="mt-3 list-disc pl-5 text-fg-secondary">{award.practice.map((id) => <li key={id}>{id.replaceAll("-", " ")}</li>)}</ul>
      <p className="mt-8 text-small text-fg-muted">Criteria version {award.criteriaVersion}. GitDojo completion records are learner-reported.</p>
    </main>
  </>;
}
