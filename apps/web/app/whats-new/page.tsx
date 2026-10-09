import { SiteHeader } from "@/components/site/site-header";
import { ReleaseAnnouncementPage } from "@/features/releases/components/ReleaseAnnouncementPage";
import { SITE } from "@/lib/site";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What’s new",
  description: `The latest improvements for learners in ${SITE.name}.`,
};

export default function WhatsNewPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[calc(100dvh-3.5rem)] max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="mb-8">
          <p className="text-small font-medium text-accent">GitDojo updates</p>
          <h1 className="mt-2 text-h1 font-bold tracking-tight text-fg">What’s new</h1>
          <p className="mt-3 max-w-2xl text-body-lg text-fg-secondary">
            The latest improvements to how you learn Git in GitDojo.
          </p>
        </div>
        <ReleaseAnnouncementPage />
      </main>
    </>
  );
}
