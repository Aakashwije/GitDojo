import { type Metadata } from "next";
import { SiteHeader } from "@/components/site/site-header";
import { CredentialNotFound } from "@/features/certificates/components/CredentialMissing";

export const metadata: Metadata = {
  title: "Credential not found",
  robots: { index: false, follow: false },
};

export default function CredentialNotFoundPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[calc(100dvh-3.5rem)] max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <CredentialNotFound />
      </main>
    </>
  );
}
