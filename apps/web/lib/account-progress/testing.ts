// Shared fixtures for the account progress tests. Test use only.
import { type ProgressCatalog } from "@gitdojo/progress";
import { type IdentityResult, type VerifiedIdentity } from "@/lib/auth/identity";
import { type ProgressApiDeps } from "./api";
import { type AccountProgressStore, type StoredCompletion } from "./store";

export const CATALOG: ProgressCatalog = {
  courses: [
    {
      id: "git-basics",
      slug: "git-basics",
      title: "Git Basics",
      description: "",
      difficulty: "beginner",
      lessons: [
        {
          id: "what-is-git",
          slug: "what-is-git",
          title: "What is Git?",
          type: "concept",
          number: 1,
        },
        { id: "git-init", slug: "git-init", title: "git init", type: "interactive", number: 2 },
        {
          id: "first-repository-challenge",
          slug: "first-repository-challenge",
          title: "Your first repository",
          type: "challenge",
          number: 3,
        },
      ],
    },
  ],
  lessons: [{ id: "first-commit", title: "Your first commit", type: "interactive" }],
  challenges: [{ id: "detached-head", title: "Detached HEAD" }],
};

export const ADA: VerifiedIdentity = {
  issuer: "https://api.asgardeo.io/t/gitdojo/oauth2/token",
  subject: "ada-subject",
  name: "Ada Lovelace",
  email: "ada@example.com",
};

export const GRACE: VerifiedIdentity = {
  issuer: "https://api.asgardeo.io/t/gitdojo/oauth2/token",
  subject: "grace-subject",
  name: "Grace Hopper",
  email: "grace@example.com",
};

/** Same subject as Ada, different organization: a different person. */
export const ADA_ELSEWHERE: VerifiedIdentity = {
  ...ADA,
  issuer: "https://api.asgardeo.io/t/other-org/oauth2/token",
};

/** An in-memory store with the database's rules: one user per (issuer, subject), one row per lesson. */
export function createMemoryProgressStore(): AccountProgressStore & {
  rows: Map<string, Map<string, StoredCompletion>>;
} {
  const rows = new Map<string, Map<string, StoredCompletion>>();
  const userRows = (identity: VerifiedIdentity) => {
    const key = JSON.stringify([identity.issuer, identity.subject]);
    let user = rows.get(key);
    if (!user) rows.set(key, (user = new Map<string, StoredCompletion>()));
    return user;
  };
  return {
    rows,
    read(identity) {
      return Promise.resolve({
        accountId: `account-${identity.subject}@${identity.issuer}`,
        completions: [...userRows(identity).values()],
      });
    },
    recordLesson(identity, completion) {
      const user = userRows(identity);
      const existing = user.get(completion.lessonId);
      const stored = existing ?? { ...completion, completedAt: new Date() };
      if (!existing) user.set(completion.lessonId, stored);
      return Promise.resolve({
        created: !existing,
        completion: stored,
        completions: [...user.values()],
      });
    },
  };
}

export function apiDeps(
  identity: IdentityResult | VerifiedIdentity,
  store: AccountProgressStore = createMemoryProgressStore(),
): ProgressApiDeps {
  const result: IdentityResult = "status" in identity ? identity : { status: "verified", identity };
  return {
    verifyIdentity: () => Promise.resolve(result),
    store: () => store,
    catalog: () => Promise.resolve(CATALOG),
  };
}

export function postLesson(
  body: unknown,
  {
    origin = "http://localhost:3000",
    headers = {},
  }: { origin?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request("http://localhost:3000/api/progress/lessons", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      ...(origin ? { origin } : {}),
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
