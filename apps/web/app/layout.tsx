import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

import { TooltipProvider } from "@gitdojo/ui";
import { type Metadata, type Viewport } from "next";
import { type ReactNode } from "react";
import releaseInfo from "@/lib/release-info.json";
import { ProgressProvider } from "@/features/progress/components/ProgressProvider";
import { ReleaseBanner } from "@/features/releases/components/ReleaseBanner";
import { ThemeSync } from "@/features/theme/components/ThemeSync";
import { THEME_COLORS } from "@/features/theme/services/theme";
import { THEME_SCRIPT } from "@/features/theme/services/theme-script";
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
  // The server renders the default (dark); THEME_SCRIPT switches both before the first paint.
  themeColor: THEME_COLORS.dark,
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Small (ids, titles, course order) and built once at build time.
  const catalog = await loadProgressCatalog();
  return (
    // `data-theme` is the default; THEME_SCRIPT may change it (and colorScheme) before hydration.
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-app text-fg">
        <ThemeSync />
        <ReleaseBanner />
        <TooltipProvider>{children}</TooltipProvider>
        <ProgressProvider catalog={catalog} />
      </body>
    </html>
  );
}
