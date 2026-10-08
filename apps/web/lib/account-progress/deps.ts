import "server-only";

import { getVerifiedIdentity } from "@/lib/auth/identity";
import { getDatabase } from "@/lib/db/client";
import { loadProgressCatalog } from "@/lib/progress-catalog";
import { createPostgresProgressStore } from "./postgres-store";
import { type AccountProgressStore, type ProgressApiDeps } from "./ports";

let store: AccountProgressStore | null = null;

/**
 * The composition root for account progress: binds its ports to the real identity provider,
 * PostgreSQL and content catalog. Tests bind the same ports to fakes (`testing.ts`).
 */
export function progressApiDeps(): ProgressApiDeps {
  return {
    verifyIdentity: () => getVerifiedIdentity(),
    store: () => (store ??= createPostgresProgressStore(getDatabase())),
    catalog: loadProgressCatalog,
  };
}
