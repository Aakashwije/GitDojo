import { createMemoryStorage, ProgressRepository } from "@gitdojo/progress";
import { waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CATALOG } from "@/lib/account-progress/testing";
import { fetchAccountProgress } from "./services/account-progress";
import {
  initProgress,
  recordCompletion,
  resetProgressStoreForTests,
  useProgressStore,
} from "./state/use-progress-store";

vi.mock("server-only", () => ({}));
vi.mock("@asgardeo/nextjs/server", () => ({ asgardeo: vi.fn() }));

afterEach(resetProgressStoreForTests);

it("uploads cached challenge XP, loads it in a fresh browser, and never re-awards it", async () => {
  let uploaded = false;
  const record = { challengeId: "detached-head", xp: 100, completedAt: "2026-01-01T00:00:00Z" };
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (input === "/api/progress")
      return Promise.resolve(
        Response.json({
          account: { id: "ada" },
          completedLessons: [],
          completedChallenges: uploaded ? [record] : [],
        }),
      );
    expect(input).toBe("/api/progress/challenges");
    expect(JSON.parse(init?.body as string)).toEqual({ challengeId: "detached-head" });
    uploaded = true;
    return Promise.resolve(Response.json({ challenge: record }, { status: 201 }));
  });
  const resolveAccount = async () => {
    const result = await fetchAccountProgress(fetcher);
    if (result.status !== "ok") throw new Error("Account unavailable");
    return {
      kind: "account" as const,
      accountId: result.accountId,
      lessons: result.lessons,
      challenges: result.challenges,
    };
  };
  const storage = createMemoryStorage();
  const cached = new ProgressRepository({
    storage,
    catalog: CATALOG,
    owner: { kind: "account", accountId: "ada" },
  });
  await cached.apply({ type: "complete", content: { kind: "challenge", id: "detached-head" } });
  await initProgress(
    CATALOG,
    (catalog, owner) => new ProgressRepository({ storage, catalog, owner }),
    { resolveAccount, fetcher },
  );
  await waitFor(() => {
    expect(uploaded).toBe(true);
  });
  await waitFor(() => {
    expect(useProgressStore.getState().saving).toBe(false);
  });
  resetProgressStoreForTests();
  const fresh = createMemoryStorage();
  await initProgress(
    CATALOG,
    (catalog, owner) => new ProgressRepository({ storage: fresh, catalog, owner }),
    { resolveAccount, fetcher },
  );
  expect(useProgressStore.getState().progress?.xp).toBe(100);
  expect(useProgressStore.getState().progress?.completedChallenges["detached-head"]).toMatchObject({
    xp: 100,
  });
  fetcher.mockClear();
  await recordCompletion({ kind: "challenge", id: "detached-head" });
  expect(useProgressStore.getState().progress?.xp).toBe(100);
  expect(fetcher).not.toHaveBeenCalled();
});

it("uploads a newly completed standalone challenge to the account", async () => {
  // Signing in also syncs this device's activity; only the challenge call is of interest here.
  const url = (input: RequestInfo | URL): string =>
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const fetcher = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(
      url(input) === "/api/progress/sync"
        ? Response.json({ account: { id: "ada" }, activity: {} })
        : Response.json(
            {
              challenge: {
                challengeId: "detached-head",
                xp: 100,
                completedAt: "2026-01-01T00:00:00Z",
              },
            },
            { status: 201 },
          ),
    ),
  );
  const storage = createMemoryStorage();
  await initProgress(
    CATALOG,
    (catalog, owner) => new ProgressRepository({ storage, catalog, owner }),
    {
      resolveAccount: () =>
        Promise.resolve({ kind: "account", accountId: "ada", lessons: {}, challenges: {} }),
      fetcher,
    },
  );
  await recordCompletion({ kind: "challenge", id: "detached-head" });
  await waitFor(() => {
    expect(useProgressStore.getState().saving).toBe(false);
  });
  const challengeCalls = fetcher.mock.calls.filter(
    ([input]) => url(input) === "/api/progress/challenges",
  );
  expect(challengeCalls).toHaveLength(1);
  expect(challengeCalls[0]).toMatchObject([
    "/api/progress/challenges",
    {
      method: "POST",
      body: JSON.stringify({ challengeId: "detached-head" }),
    },
  ]);
  expect(useProgressStore.getState().progress?.xp).toBe(100);
});
