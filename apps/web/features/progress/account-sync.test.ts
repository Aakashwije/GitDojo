import {
  createMemoryStorage,
  ProgressRepository,
  type ProgressCatalog,
  type ProgressOwner,
  type ProgressStorage,
} from "@gitdojo/progress";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountSessionForTests } from "@/features/auth/state/use-account-session";
import {
  initProgress,
  recordCompletion,
  resetProgressStoreForTests,
  resolveBrowserAccount,
  useProgressStore,
  type AccountResolution,
} from "./state/use-progress-store";

const CATALOG: ProgressCatalog = {
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
        { id: "staging-area", slug: "staging-area", title: "Staging", type: "concept", number: 3 },
      ],
    },
  ],
  lessons: [],
  challenges: [],
};

const WHAT_IS_GIT = {
  kind: "lesson",
  id: "what-is-git",
  type: "concept",
  courseId: "git-basics",
} as const;
const GIT_INIT = {
  kind: "lesson",
  id: "git-init",
  type: "interactive",
  courseId: "git-basics",
} as const;
const STAGING = {
  kind: "lesson",
  id: "staging-area",
  type: "concept",
  courseId: "git-basics",
} as const;

const FIRST = "2026-01-02T03:04:05.000Z";

const requestUrl = (input: RequestInfo | URL) =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

/** A stand-in for GitDojo's account endpoints: one account's completions, keyed by lesson. */
function fakeServer() {
  const completions = new Map<string, { xp: number; type: string; completedAt: string }>();
  const state = { progressStatus: 200, uploadStatus: 0, posts: [] as string[] };
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url === "/api/progress") {
      if (state.progressStatus !== 200) {
        return Promise.resolve(new Response(null, { status: state.progressStatus }));
      }
      return Promise.resolve(
        Response.json({
          account: { id: "account-ada" },
          completedLessons: [...completions].map(([lessonId, c]) => ({
            lessonId,
            ...c,
            course: { id: "git-basics" },
          })),
          totalXp: 0,
        }),
      );
    }
    if (url === "/api/progress/lessons" && init?.method === "POST") {
      const { lessonId } = JSON.parse(init.body as string) as { lessonId: string };
      state.posts.push(lessonId);
      if (state.uploadStatus !== 0) {
        return Promise.resolve(new Response(null, { status: state.uploadStatus }));
      }
      const lesson = CATALOG.courses[0]?.lessons.find((l) => l.id === lessonId);
      const xp = lesson?.type === "concept" ? 25 : 50;
      const existing = completions.get(lessonId);
      const record = existing ?? { xp, type: lesson?.type ?? "concept", completedAt: FIRST };
      completions.set(lessonId, record);
      return Promise.resolve(
        Response.json(
          { lesson: { lessonId, ...record, course: { id: "git-basics" } } },
          { status: existing ? 200 : 201 },
        ),
      );
    }
    return Promise.reject(new TypeError(`unexpected request ${url}`));
  });
  return { completions, state, fetcher };
}

/** One page load: the store starts fresh, the browser's storage persists between visits. */
async function visit(
  storage: ProgressStorage,
  resolveAccount: () => Promise<AccountResolution>,
  fetcher?: typeof fetch,
) {
  resetProgressStoreForTests();
  await initProgress(
    CATALOG,
    (catalog, owner: ProgressOwner) => new ProgressRepository({ storage, catalog, owner }),
    { resolveAccount, ...(fetcher ? { fetcher } : {}) },
  );
}

const accountOf = (server: ReturnType<typeof fakeServer>) => async () => {
  const response = await server.fetcher("/api/progress");
  const body = (await response.json()) as {
    completedLessons: { lessonId: string; xp: number; type: string; completedAt: string }[];
  };
  const lessons = Object.fromEntries(
    body.completedLessons.map((l) => [
      l.lessonId,
      {
        xp: l.xp,
        type: l.type as "concept",
        completedAt: Date.parse(l.completedAt),
        courseId: "git-basics",
      },
    ]),
  );
  return { kind: "account", accountId: "account-ada", lessons } as const;
};

const anonymous = () => Promise.resolve<AccountResolution>({ kind: "anonymous" });

const state = () => useProgressStore.getState();
const lessons = () => Object.keys(state().progress?.completedLessons ?? {}).sort();

async function settled() {
  await waitFor(() => {
    expect(state().saving).toBe(false);
  });
}

beforeEach(() => {
  resetProgressStoreForTests();
  resetAccountSessionForTests();
});

describe("account progress in the browser", () => {
  it("loads account progress into a fresh browser", async () => {
    const server = fakeServer();
    server.completions.set("what-is-git", { xp: 25, type: "concept", completedAt: FIRST });
    await visit(createMemoryStorage(), accountOf(server), server.fetcher);
    expect(state().mode).toBe("account");
    expect(lessons()).toEqual(["what-is-git"]);
    expect(state().progress?.xp).toBe(25);
    expect(state().progress?.completedLessons["what-is-git"]?.completedAt).toBe(Date.parse(FIRST));
  });

  it("saves a lesson completion to the account and adopts the account's record", async () => {
    const server = fakeServer();
    await visit(createMemoryStorage(), accountOf(server), server.fetcher);
    await recordCompletion(GIT_INIT);
    await settled();
    expect(server.state.posts).toEqual(["git-init"]);
    expect(server.completions.has("git-init")).toBe(true);
    expect(state().progress?.completedLessons["git-init"]?.completedAt).toBe(Date.parse(FIRST));
    expect(state().lastAward).toEqual({ key: "lesson:git-init", xp: 50 });
  });

  it("awards XP once: a repeated completion sends nothing and earns nothing", async () => {
    const server = fakeServer();
    await visit(createMemoryStorage(), accountOf(server), server.fetcher);
    await recordCompletion(WHAT_IS_GIT);
    await settled();
    await recordCompletion(WHAT_IS_GIT);
    await settled();
    expect(server.state.posts).toEqual(["what-is-git"]);
    expect(state().lastAward).toEqual({ key: "lesson:what-is-git", xp: 0 });
    expect(state().progress?.xp).toBe(25);
  });

  it("never sends anonymous progress to an account", async () => {
    const server = fakeServer();
    await visit(createMemoryStorage(), anonymous, server.fetcher);
    await recordCompletion(WHAT_IS_GIT);
    await settled();
    expect(state().mode).toBe("anonymous");
    expect(server.fetcher).not.toHaveBeenCalled();
  });

  it("keeps anonymous progress and each account apart in the same browser", async () => {
    const storage = createMemoryStorage();
    const server = fakeServer();
    await visit(storage, anonymous);
    await recordCompletion(STAGING);
    await settled();

    // Signing in shows only the account's progress, and never uploads the anonymous lesson.
    await visit(storage, accountOf(server), server.fetcher);
    expect(lessons()).toEqual([]);
    await recordCompletion(GIT_INIT);
    await settled();
    expect(server.state.posts).toEqual(["git-init"]);

    // Another account in the same browser starts empty.
    const grace = () =>
      Promise.resolve<AccountResolution>({ kind: "account", accountId: "grace", lessons: {} });
    await visit(storage, grace, fakeServer().fetcher);
    expect(lessons()).toEqual([]);

    // Signed out again: the anonymous progress is back, untouched.
    await visit(storage, anonymous);
    expect(lessons()).toEqual(["staging-area"]);
  });

  it("explains an ended session and uploads the lesson after signing in again", async () => {
    const storage = createMemoryStorage();
    const server = fakeServer();
    await visit(storage, accountOf(server), server.fetcher);
    server.state.uploadStatus = 401;
    await recordCompletion(WHAT_IS_GIT);
    await settled();
    expect(state().accountNotice).toBe("session-ended");
    // Kept in this browser's copy of the account.
    expect(lessons()).toEqual(["what-is-git"]);

    server.state.uploadStatus = 0;
    await visit(storage, accountOf(server), server.fetcher);
    await settled();
    expect(server.completions.has("what-is-git")).toBe(true);
    expect(state().accountNotice).toBeNull();
  });

  it("explains an unavailable account service and retries on the next visit", async () => {
    const storage = createMemoryStorage();
    const server = fakeServer();
    await visit(storage, accountOf(server), server.fetcher);
    server.state.uploadStatus = 503;
    await recordCompletion(GIT_INIT);
    await settled();
    expect(state().accountNotice).toBe("unavailable");
    expect(server.completions.has("git-init")).toBe(false);

    server.state.uploadStatus = 0;
    await visit(storage, accountOf(server), server.fetcher);
    await settled();
    expect(server.completions.has("git-init")).toBe(true);
    expect(server.state.posts).toEqual(["git-init", "git-init"]);
  });

  it("keeps a signed-in learner out of anonymous progress when the account can't be loaded", async () => {
    const storage = createMemoryStorage();
    const server = fakeServer();
    await visit(storage, () => Promise.resolve({ kind: "unavailable" }), server.fetcher);
    expect(state().mode).toBe("account-unavailable");
    expect(state().accountNotice).toBe("load-failed");
    await recordCompletion(WHAT_IS_GIT);
    await settled();
    // Still sent to the account, but not written to anonymous progress.
    expect(server.state.posts).toEqual(["what-is-git"]);
    await visit(storage, anonymous);
    expect(lessons()).toEqual([]);
  });
});

describe("resolveBrowserAccount", () => {
  function fetcherFor(session: unknown, progress: Response | null) {
    return vi.fn((input: RequestInfo | URL) => {
      if (requestUrl(input) === "/api/auth/session") return Promise.resolve(Response.json(session));
      return progress ? Promise.resolve(progress) : new Promise<Response>(() => undefined);
    }) as unknown as typeof fetch;
  }

  it("is anonymous for signed-out visitors without asking for account progress", async () => {
    const fetcher = fetcherFor({ status: "signed-out" }, null);
    expect(await resolveBrowserAccount(fetcher)).toEqual({ kind: "anonymous" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reads account progress for signed-in learners", async () => {
    const fetcher = fetcherFor(
      { status: "signed-in", user: { name: "Ada", email: null, picture: null } },
      Response.json({
        account: { id: "account-ada" },
        completedLessons: [
          { lessonId: "git-init", type: "interactive", xp: 50, completedAt: FIRST, course: null },
        ],
        totalXp: 50,
      }),
    );
    expect(await resolveBrowserAccount(fetcher)).toEqual({
      kind: "account",
      accountId: "account-ada",
      lessons: { "git-init": { completedAt: Date.parse(FIRST), xp: 50, type: "interactive" } },
    });
  });

  it("treats a rejected session as signed out, with a notice", async () => {
    const fetcher = fetcherFor(
      { status: "signed-in", user: { name: "Ada", email: null, picture: null } },
      new Response(null, { status: 401 }),
    );
    expect(await resolveBrowserAccount(fetcher)).toEqual({
      kind: "anonymous",
      notice: "session-ended",
    });
  });

  it("never falls back to anonymous progress when the account is unavailable or slow", async () => {
    const signedIn = { status: "signed-in", user: { name: "Ada", email: null, picture: null } };
    expect(
      await resolveBrowserAccount(fetcherFor(signedIn, new Response(null, { status: 503 }))),
    ).toEqual({ kind: "unavailable" });
    resetAccountSessionForTests();
    expect(await resolveBrowserAccount(fetcherFor(signedIn, null), 20)).toEqual({
      kind: "unavailable",
    });
  });
});
