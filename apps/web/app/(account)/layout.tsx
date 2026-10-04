import { AsgardeoProvider } from "@asgardeo/nextjs/server";
import { type ReactNode } from "react";
import { AUTH_PROVIDER_OPTIONS, readAuthConfig } from "@/lib/auth/config";

// Configuration is read per request, never frozen into a build without credentials.
export const dynamic = "force-dynamic";

/**
 * Account pages (sign-in, sign-up, callback, sign-out, account) are the only ones that load the
 * identity provider SDK. Learning pages stay static and never depend on it.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  if (!readAuthConfig().configured) return children;
  return <AsgardeoProvider {...AUTH_PROVIDER_OPTIONS}>{children}</AsgardeoProvider>;
}
