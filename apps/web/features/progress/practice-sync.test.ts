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

const url = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

it("uploads a solved practice task once, restores it in a fresh browser, and never adds XP", async () => {
  let uploaded = 0;
  const record = { taskId: "tag-a-release", completedAt: "2026-01-01T00:00:00Z" };
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = url(input);
    if (path === "/api/progress")
      return Promise.resolve(
        Response.json({
          account: { id: "ada" },
          completedLessons: [],
          completedChallenges: [],
          completedPractice: uploaded > 0 ? [record] : [],
        }),
      );
    if (path === "/api/progress/sync") {
      return Promise.resolve(Response.json({ account: { id: "ada" }, activity: {} }));
    }
    expect(path).toBe("/api/progress/practice");
    expect(JSON.parse(init?.body as string)).toEqual({ taskId: "tag-a-release" });
    uploaded += 1;
    return Promise.resolve(Response.json({ practice: record }, { status: 201 }));
  });
  const resolveAccount = async () => {
    const result = await fetchAccountProgress(fetcher);
    if (result.status !== "ok") throw new Error("Account unavailable");
    return {
      kind: "account" as const,
      accountId: result.accountId,
      lessons: result.lessons,
      ...(result.practice ? { practice: result.practice } : {}),
    };
  };
  await initProgress(
    CATALOG,
    (catalog, owner) => new ProgressRepository({ storage: createMemoryStorage(), catalog, owner }),
    { resolveAccount, fetcher },
  );
  await recordCompletion({ kind: "practice", id: "tag-a-release" });
  await waitFor(() => {
    expect(useProgressStore.getState().saving).toBe(false);
  });
  expect(uploaded).toBe(1);
  expect(useProgressStore.getState().progress?.xp).toBe(0);
  // Solving it again sends nothing.
  await recordCompletion({ kind: "practice", id: "tag-a-release" });
  expect(uploaded).toBe(1);

  resetProgressStoreForTests();
  await initProgress(
    CATALOG,
    (catalog, owner) => new ProgressRepository({ storage: createMemoryStorage(), catalog, owner }),
    { resolveAccount, fetcher },
  );
  const progress = useProgressStore.getState().progress;
  expect(progress?.completedPractice["tag-a-release"]).toEqual({
    completedAt: Date.parse(record.completedAt),
    xp: 0,
  });
  expect(progress?.xp).toBe(0);
});

it("keeps practice in anonymous progress local, with no upload", async () => {
  const fetcher = vi.fn(() => Promise.reject(new Error("no network")));
  await initProgress(
    CATALOG,
    (catalog, owner) => new ProgressRepository({ storage: createMemoryStorage(), catalog, owner }),
    { fetcher: fetcher as unknown as typeof fetch },
  );
  await recordCompletion({ kind: "practice", id: "tag-a-release" });
  expect(useProgressStore.getState().progress?.completedPractice).toHaveProperty("tag-a-release");
  expect(fetcher).not.toHaveBeenCalled();
});
