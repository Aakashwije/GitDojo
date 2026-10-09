import {
  createMemoryStorage,
  ProgressRepository,
  withRemoteCounters,
  type ProgressCatalog,
  type ProgressOwner,
  type ProgressStorage,
} from "@gitdojo/progress";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountSessionForTests } from "@/features/auth";
import { deviceActivityPayload, fetchAccountProgress } from "./services/account-progress";
import {
  initProgress,
  recordProgress,
  resetProgressStoreForTests,
  syncNow,
  useProgressStore,
  type AccountResolution,
} from "./state/use-progress-store";

/**
 * Activity sync across devices. The fake account below keeps one row per device, exactly as the
 * database does, so these exercise the real merge rules rather than a stub that agrees with the
 * client.
 */

const CATALOG: ProgressCatalog = {
  courses: [
    {
      id: "git-basics",
      slug: "git-basics",
      title: "Git Basics",
      description: "",
      difficulty: "beginner",
      lessons: [
        { id: "git-init", slug: "git-init", title: "git init", type: "interactive", number: 1 },
        { id: "git-add", slug: "git-add", title: "git add", type: "interactive", number: 2 },
      ],
    },
  ],
  lessons: [],
  challenges: [],
};

const requestUrl = (input: RequestInfo | URL) =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

interface Row {
  commandStats: Record<string, { uses: number; successes: number; lastUsedAt: string }>;
  playgroundSessions: number;
}

/** One account on a server that stores counters per device, hints as a set and one last lesson. */
function fakeAccount() {
  const devices = new Map<string, Row>();
  const hints = new Set<string>();
  /** Release → earliest time seen, as the `seen_releases` table keeps it. */
  const seenReleases = new Map<string, string>();
  let lastLesson: { courseId: string; lessonId: string; visitedAt: string } | null = null;
  const state = { status: 200, uploads: 0 };

  const view = (exclude?: string) => {
    const commandStats: Row["commandStats"] = {};
    let playgroundSessions = 0;
    for (const [deviceId, row] of devices) {
      if (deviceId === exclude) continue;
      playgroundSessions += row.playgroundSessions;
      for (const [command, stat] of Object.entries(row.commandStats)) {
        const total = commandStats[command];
        commandStats[command] = total
          ? {
              uses: total.uses + stat.uses,
              successes: total.successes + stat.successes,
              lastUsedAt: total.lastUsedAt > stat.lastUsedAt ? total.lastUsedAt : stat.lastUsedAt,
            }
          : { ...stat };
      }
    }
    const revealedHints: Record<string, string[]> = {};
    for (const entry of hints) {
      const [key, hint] = entry.split("|");
      if (key && hint) (revealedHints[key] ??= []).push(hint);
    }
    return {
      commandStats,
      playgroundSessions,
      revealedHints,
      lastLesson,
      seenReleases: Object.fromEntries(seenReleases),
    };
  };

  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.startsWith("/api/progress/sync")) {
      state.uploads += 1;
      if (state.status !== 200) {
        return Promise.resolve(new Response(null, { status: state.status }));
      }
      const body = JSON.parse(init?.body as string) as {
        deviceId: string;
        commandStats: Row["commandStats"];
        playgroundSessions: number;
        revealedHints: Record<string, string[]>;
        lastLesson: { courseId: string; lessonId: string; visitedAt: string } | null;
        seenReleases?: Record<string, string>;
      };
      for (const [version, seenAt] of Object.entries(body.seenReleases ?? {})) {
        const current = seenReleases.get(version);
        if (!current || seenAt < current) seenReleases.set(version, seenAt);
      }
      // Counters never go backwards, and only this device's row is touched.
      const row = devices.get(body.deviceId) ?? { commandStats: {}, playgroundSessions: 0 };
      for (const [command, stat] of Object.entries(body.commandStats)) {
        const current = row.commandStats[command];
        const previousUsedAt = current?.lastUsedAt ?? "";
        row.commandStats[command] = {
          uses: Math.max(current?.uses ?? 0, stat.uses),
          successes: Math.max(current?.successes ?? 0, stat.successes),
          lastUsedAt: previousUsedAt > stat.lastUsedAt ? previousUsedAt : stat.lastUsedAt,
        };
      }
      row.playgroundSessions = Math.max(row.playgroundSessions, body.playgroundSessions);
      devices.set(body.deviceId, row);
      for (const [key, list] of Object.entries(body.revealedHints)) {
        for (const hint of list) hints.add(`${key}|${hint}`);
      }
      if (body.lastLesson && (!lastLesson || body.lastLesson.visitedAt > lastLesson.visitedAt)) {
        lastLesson = body.lastLesson;
      }
      return Promise.resolve(
        Response.json({ account: { id: "ada" }, activity: view(body.deviceId) }),
      );
    }
    if (url.startsWith("/api/progress")) {
      const device = new URL(url, "http://localhost").searchParams.get("device") ?? undefined;
      return Promise.resolve(
        Response.json({
          account: { id: "ada" },
          completedLessons: [],
          completedChallenges: [],
          activity: view(device),
          totalXp: 0,
        }),
      );
    }
    return Promise.reject(new TypeError(`unexpected request ${url}`));
  });

  return { devices, seenReleases, state, fetcher, view };
}

/** One page load on one device: its own storage, the shared account. */
async function visit(storage: ProgressStorage, fetcher: typeof fetch) {
  resetProgressStoreForTests();
  // The real read path: on a first load the device cannot name itself yet, exactly as in the app.
  const resolveAccount = async (): Promise<AccountResolution> => {
    const result = await fetchAccountProgress(fetcher);
    if (result.status !== "ok") throw new Error(result.status);
    return {
      kind: "account",
      accountId: result.accountId,
      lessons: result.lessons,
      challenges: result.challenges,
      activity: result.activity,
    };
  };
  await initProgress(
    CATALOG,
    (catalog, owner: ProgressOwner) => new ProgressRepository({ storage, catalog, owner }),
    { resolveAccount, fetcher },
  );
}

const settled = () =>
  waitFor(() => {
    expect(useProgressStore.getState().saving).toBe(false);
  });

const merged = () => {
  const progress = useProgressStore.getState().progress;
  if (!progress) throw new Error("no progress");
  return withRemoteCounters(progress);
};

beforeEach(() => {
  resetProgressStoreForTests();
  resetAccountSessionForTests();
});

describe("activity sync across devices", () => {
  it("adds another device's commands and sessions without double counting its own", async () => {
    const account = fakeAccount();
    const laptop = createMemoryStorage();
    const phone = createMemoryStorage();

    await visit(laptop, account.fetcher);
    await recordProgress({ type: "command", command: "commit", ok: true });
    await recordProgress({ type: "command", command: "commit", ok: false });
    await recordProgress({ type: "playground-session" });
    await syncNow();
    await settled();
    // Nothing from anywhere else yet: the learner sees exactly what they did here.
    expect(merged().commandStats.commit).toMatchObject({ uses: 2, successes: 1 });
    expect(merged().playgroundSessions).toBe(1);

    await visit(phone, account.fetcher);
    await recordProgress({ type: "command", command: "commit", ok: true });
    await syncNow();
    await settled();
    expect(merged().commandStats.commit).toMatchObject({ uses: 3, successes: 2 });
    expect(merged().playgroundSessions).toBe(1);

    // Back on the laptop, with the phone's work added and its own counted once.
    await visit(laptop, account.fetcher);
    await settled();
    expect(merged().commandStats.commit).toMatchObject({ uses: 3, successes: 2 });
  });

  it("counts nothing twice when the same upload is retried", async () => {
    const account = fakeAccount();
    const laptop = createMemoryStorage();
    await visit(laptop, account.fetcher);
    await recordProgress({ type: "command", command: "commit", ok: true });
    for (let i = 0; i < 5; i += 1) await syncNow();
    await settled();
    expect(merged().commandStats.commit).toMatchObject({ uses: 1 });

    // Another device's view is the laptop's single use, however many times it was sent.
    expect(account.view("other").commandStats.commit).toMatchObject({ uses: 1 });
  });

  it("merges hints as a set and keeps the most recent lesson visit", async () => {
    const account = fakeAccount();
    const laptop = createMemoryStorage();
    const phone = createMemoryStorage();

    await visit(laptop, account.fetcher);
    await recordProgress({
      type: "hint",
      content: { kind: "lesson", id: "git-init" },
      objectiveId: "stage",
      index: 0,
    });
    await recordProgress({ type: "visit-lesson", courseId: "git-basics", lessonId: "git-init" });
    await syncNow();
    await settled();

    await visit(phone, account.fetcher);
    await settled();
    // The phone did not reveal that hint, but the account did.
    expect(useProgressStore.getState().progress?.revealedHints["lesson:git-init"]).toEqual([
      "stage#0",
    ]);
    expect(useProgressStore.getState().progress?.lastLesson).toMatchObject({
      lessonId: "git-init",
    });

    await recordProgress({
      type: "hint",
      content: { kind: "lesson", id: "git-init" },
      objectiveId: "commit",
      index: 0,
    });
    await recordProgress({ type: "visit-lesson", courseId: "git-basics", lessonId: "git-add" });
    await syncNow();
    await settled();

    await visit(laptop, account.fetcher);
    await settled();
    const progress = useProgressStore.getState().progress;
    expect(progress?.revealedHints["lesson:git-init"]?.sort()).toEqual(["commit#0", "stage#0"]);
    // The newer visit wins, even though this device visited git-init itself.
    expect(progress?.lastLesson).toMatchObject({ lessonId: "git-add" });
  });

  it("keeps working offline and sends everything once the account is reachable", async () => {
    const account = fakeAccount();
    const laptop = createMemoryStorage();
    await visit(laptop, account.fetcher);
    await settled();
    const syncedBefore = useProgressStore.getState().syncedAt;

    account.state.status = 503;
    await recordProgress({ type: "command", command: "commit", ok: true });
    await recordProgress({ type: "playground-session" });
    await syncNow();
    await settled();

    // Learning carries on, the progress is kept here, and the learner is told.
    expect(useProgressStore.getState().sync).toBe("paused");
    expect(useProgressStore.getState().accountNotice).toBe("unavailable");
    // Nothing is called synced that the server has not confirmed.
    expect(useProgressStore.getState().syncedAt).toBe(syncedBefore);
    expect(merged().commandStats.commit).toMatchObject({ uses: 1 });
    expect(account.devices.get("laptop")).toBeUndefined();

    // More activity while the account is away.
    await recordProgress({ type: "command", command: "commit", ok: true });

    account.state.status = 200;
    await syncNow();
    await settled();
    expect(useProgressStore.getState().sync).toBe("synced");
    expect(useProgressStore.getState().accountNotice).toBeNull();
    expect(useProgressStore.getState().syncedAt).toBeGreaterThan(syncedBefore ?? 0);
    // Both uses arrived, exactly once.
    expect(account.view("other").commandStats.commit).toMatchObject({ uses: 2 });
  });

  it("says the session ended and keeps the progress for the next sign-in", async () => {
    const account = fakeAccount();
    await visit(createMemoryStorage(), account.fetcher);
    account.state.status = 401;
    await recordProgress({ type: "command", command: "commit", ok: true });
    await syncNow();
    await settled();
    expect(useProgressStore.getState().sync).toBe("paused");
    expect(useProgressStore.getState().accountNotice).toBe("session-ended");
    expect(merged().commandStats.commit).toMatchObject({ uses: 1 });
  });

  it("stops retrying a payload the server will never accept, and still keeps it", async () => {
    const account = fakeAccount();
    await visit(createMemoryStorage(), account.fetcher);
    account.state.status = 422;
    await recordProgress({ type: "command", command: "commit", ok: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await syncNow();
    await settled();
    warn.mockRestore();
    expect(useProgressStore.getState().sync).toBe("paused");
    expect(merged().commandStats.commit).toMatchObject({ uses: 1 });
  });

  it("never syncs anything for an anonymous learner", async () => {
    const account = fakeAccount();
    resetProgressStoreForTests();
    await initProgress(
      CATALOG,
      (catalog, owner: ProgressOwner) =>
        new ProgressRepository({ storage: createMemoryStorage(), catalog, owner }),
      { resolveAccount: () => Promise.resolve({ kind: "anonymous" }), fetcher: account.fetcher },
    );
    await recordProgress({ type: "command", command: "commit", ok: true });
    await syncNow();
    await settled();
    expect(account.fetcher).not.toHaveBeenCalled();
    expect(useProgressStore.getState().sync).toBe("off");
  });
});

describe("seen release announcements across devices", () => {
  const seen = (version: string) =>
    useProgressStore.getState().progress?.seenReleases[version] !== undefined;

  it("hides a release dismissed on one device on the learner's others", async () => {
    const account = fakeAccount();
    const laptop = createMemoryStorage();
    const phone = createMemoryStorage();

    await visit(laptop, account.fetcher);
    await settled();
    await recordProgress({ type: "see-release", version: "v0.1.12" });
    await syncNow();
    await settled();
    expect(account.seenReleases.has("v0.1.12")).toBe(true);

    // A device that never saw the banner hears about it on its first load.
    await visit(phone, account.fetcher);
    await settled();
    expect(seen("v0.1.12")).toBe(true);
    // A later release is a separate entry, so its banner still shows.
    expect(seen("v0.1.13")).toBe(false);
  });

  it("keeps a dismissal made offline and sends it once the account is reachable", async () => {
    const account = fakeAccount();
    const laptop = createMemoryStorage();
    await visit(laptop, account.fetcher);
    await settled();

    account.state.status = 503;
    await recordProgress({ type: "see-release", version: "v0.1.12" });
    await syncNow();
    await settled();
    expect(useProgressStore.getState().sync).toBe("paused");
    expect(seen("v0.1.12")).toBe(true);
    expect(account.seenReleases.size).toBe(0);

    // A reload while still offline keeps it: it is in this device's copy of the account.
    await visit(laptop, account.fetcher);
    account.state.status = 503;
    await settled();
    expect(seen("v0.1.12")).toBe(true);

    account.state.status = 200;
    await syncNow();
    await settled();
    expect(account.seenReleases.has("v0.1.12")).toBe(true);
  });

  it("agrees on the first time seen, whichever device reports last", async () => {
    const account = fakeAccount();
    const laptop = createMemoryStorage();
    const phone = createMemoryStorage();
    await visit(phone, account.fetcher);
    await recordProgress({ type: "see-release", version: "v0.1.12" });
    await syncNow();
    await settled();
    const first = useProgressStore.getState().progress?.seenReleases["v0.1.12"];

    await visit(laptop, account.fetcher);
    await settled();
    // Opening the page again here changes nothing: the account already has it.
    await recordProgress({ type: "see-release", version: "v0.1.12" });
    await syncNow();
    await settled();
    expect(useProgressStore.getState().progress?.seenReleases["v0.1.12"]).toBe(first);
    expect(account.seenReleases.size).toBe(1);
  });

  it("keeps an anonymous learner's choice in this browser and never uploads it", async () => {
    const account = fakeAccount();
    const storage = createMemoryStorage();
    const anonymously = async () => {
      resetProgressStoreForTests();
      await initProgress(
        CATALOG,
        (catalog, owner: ProgressOwner) => new ProgressRepository({ storage, catalog, owner }),
        { resolveAccount: () => Promise.resolve({ kind: "anonymous" }), fetcher: account.fetcher },
      );
    };
    await anonymously();
    await recordProgress({ type: "see-release", version: "v0.1.12" });
    await syncNow();
    await settled();
    await anonymously();
    expect(seen("v0.1.12")).toBe(true);
    expect(account.fetcher).not.toHaveBeenCalled();
  });
});

describe("the upload payload", () => {
  it("sends this device's absolute counters, not a delta", () => {
    const progress = {
      ...withRemoteCounters({
        ...emptyish(),
        commandStats: { commit: { uses: 2, successes: 1, lastUsedAt: Date.UTC(2026, 0, 2) } },
        playgroundSessions: 3,
        remoteCounters: {
          commandStats: { commit: { uses: 99, successes: 99, lastUsedAt: 0 } },
          playgroundSessions: 99,
        },
      }),
      // withRemoteCounters is for display; the payload must use the device's own numbers.
      commandStats: { commit: { uses: 2, successes: 1, lastUsedAt: Date.UTC(2026, 0, 2) } },
      playgroundSessions: 3,
    };
    const payload = deviceActivityPayload(progress) as {
      commandStats: Record<string, { uses: number }>;
      playgroundSessions: number;
    };
    expect(payload.commandStats.commit).toMatchObject({ uses: 2, successes: 1 });
    expect(payload.playgroundSessions).toBe(3);
  });

  it("leaves out entries the server would refuse, rather than losing the whole upload", () => {
    const payload = deviceActivityPayload({
      ...emptyish(),
      commandStats: {
        commit: { uses: 1, successes: 1, lastUsedAt: 0 },
        "rm -rf": { uses: 1, successes: 1, lastUsedAt: 0 },
      },
      revealedHints: { "lesson:git-init": ["stage#0", "nope"], "bad key": ["a#0"] },
    }) as {
      commandStats: Record<string, { lastUsedAt: string }>;
      revealedHints: Record<string, string[]>;
    };
    expect(Object.keys(payload.commandStats)).toEqual(["commit"]);
    expect(payload.revealedHints).toEqual({ "lesson:git-init": ["stage#0"] });
    // A missing timestamp is replaced by one the server accepts, not sent as 1970.
    const commit = payload.commandStats.commit;
    expect(Date.parse(commit?.lastUsedAt ?? "")).toBeGreaterThan(Date.UTC(2020, 0, 1));
  });
});

/** A bare record, for payload tests that do not need storage. */
function emptyish() {
  const now = Date.UTC(2026, 0, 1);
  return {
    schemaVersion: 3 as const,
    seenReleases: {},
    owner: { kind: "account" as const, accountId: "ada" },
    deviceId: "laptop",
    completedLessons: {},
    completedChallenges: {},
    xp: 0,
    commandStats: {},
    revealedHints: {},
    playgroundSessions: 0,
    migrations: {},
    createdAt: now,
    updatedAt: now,
    revision: 0,
  };
}
