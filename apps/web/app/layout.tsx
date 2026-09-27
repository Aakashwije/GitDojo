import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

import { TooltipProvider } from "@gitdojo/ui";
import { type Metadata, type Viewport } from "next";
import { type ReactNode } from "react";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  // Absolute base for social preview images (app/opengraph-image.png). Set in deployment.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: `${SITE.name} - ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-app text-fg">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
