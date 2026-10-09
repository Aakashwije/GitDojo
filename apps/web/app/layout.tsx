import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

import { TooltipProvider } from "@gitdojo/ui";
import { type Metadata, type Viewport } from "next";
import { type ReactNode } from "react";
import releaseInfo from "@/lib/release-info.json";
import { ProgressProvider } from "@/features/progress/components/ProgressProvider";
import { ReleaseBanner } from "@/features/releases/components/ReleaseBanner";
import { loadProgressCatalog } from "@/lib/progress-catalog";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  // Absolute base for social preview images (app/opengraph-image.png). Set in deployment.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: `${SITE.name} - ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  other: {
    "gitdojo:version": process.env.NEXT_PUBLIC_APP_VERSION ?? releaseInfo.version ?? "development",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Small (ids, titles, course order) and built once at build time.
  const catalog = await loadProgressCatalog();
  return (
    <html lang="en">
      <body className="min-h-dvh bg-app text-fg">
        <ReleaseBanner />
        <TooltipProvider>{children}</TooltipProvider>
        <ProgressProvider catalog={catalog} />
      </body>
    </html>
  );
}
