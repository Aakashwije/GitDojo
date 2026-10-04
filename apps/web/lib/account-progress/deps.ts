import "server-only";

import { getVerifiedIdentity } from "@/lib/auth/identity";
import { getDatabase } from "@/lib/db/client";
import { loadProgressCatalog } from "@/lib/progress-catalog";
import { type ProgressApiDeps } from "./api";
import { createPostgresProgressStore, type AccountProgressStore } from "./store";

let store: AccountProgressStore | null = null;

/** The real identity provider, PostgreSQL and content catalog. */
export function progressApiDeps(): ProgressApiDeps {
  return {
    verifyIdentity: () => getVerifiedIdentity(),
    store: () => (store ??= createPostgresProgressStore(getDatabase())),
    catalog: loadProgressCatalog,
  };
}
