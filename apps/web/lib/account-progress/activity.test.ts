import { describe, expect, it, vi } from "vitest";
import { parseDeviceActivity, SUPPORTED_SYNC_VERSIONS, SYNC_LIMITS } from "./activity";
import { getProgress, syncProgress } from "./api";
import {
  ADA,
  ADA_ELSEWHERE,
  apiDeps,
  createMemoryProgressStore,
  getRequest,
  GRACE,
  postSync,
} from "./testing";

vi.mock("server-only", () => ({}));
vi.mock("@asgardeo/nextjs/server", () => ({ asgardeo: vi.fn() }));

const NOW = Date.UTC(2026, 9, 9, 12);
const AT = (offset = 0) => new Date(NOW + offset).toISOString();

const json = async (response: Response) => (await response.json()) as Record<string, unknown>;
const errorCode = async (response: Response) =>
  ((await json(response)).error as { code: string }).code;

/** A minimal valid upload; tests override the fields they are about. */
function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    deviceId: "device-a",
    commandStats: { commit: { uses: 3, successes: 2, lastUsedAt: AT(-1000) } },
    playgroundSessions: 1,
    revealedHints: { "lesson:git-init": ["stage#0"] },
    lastLesson: { courseId: "git-basics", lessonId: "git-init", visitedAt: AT(-2000) },
    ...overrides,
  };
}

const activityOf = async (response: Response) =>
  (await json(response)).activity as {
    commandStats: Record<string, { uses: number; successes: number; lastUsedAt: string }>;
    playgroundSessions: number;
    revealedHints: Record<string, string[]>;
    lastLesson: { courseId: string; lessonId: string; visitedAt: string } | null;
    seenReleases: Record<string, string>;
  };

describe("parseDeviceActivity", () => {
  it("accepts a well-formed upload and a nearly empty one", () => {
    const full = parseDeviceActivity(payload(), NOW);
    expect(full.ok && full.activity).toMatchObject({
      deviceId: "device-a",
      playgroundSessions: 1,
      commandStats: [{ command: "commit", uses: 3, successes: 2 }],
      revealedHints: { "lesson:git-init": ["stage#0"] },
    });
    // A device that has only visited a lesson sends only that.
    const sparse = parseDeviceActivity({ schemaVersion: 1, deviceId: "d" }, NOW);
    expect(sparse.ok && sparse.activity).toMatchObject({
      deviceId: "d",
      commandStats: [],
      playgroundSessions: 0,
      lastLesson: null,
    });
  });

  it("refuses a schema version it does not understand rather than storing part of it", () => {
    const ahead = parseDeviceActivity(payload({ schemaVersion: 99 }), NOW);
    expect(ahead).toMatchObject({ ok: false, code: "unsupported_schema_version" });
    expect(SUPPORTED_SYNC_VERSIONS).toContain(1);
    for (const version of [undefined, "2", 0, 1.5]) {
      expect(parseDeviceActivity(payload({ schemaVersion: version }), NOW).ok).toBe(false);
    }
  });

  it.each([
    ["not an object", [] as unknown, "invalid_body"],
    ["an unknown field", payload({ xp: 1000 }), "unexpected_fields"],
    ["a missing device", payload({ deviceId: undefined }), "invalid_device_id"],
    ["a device id with a slash", payload({ deviceId: "a/b" }), "invalid_device_id"],
    ["an over-long device id", payload({ deviceId: "d".repeat(101) }), "invalid_device_id"],
  ])("rejects %s", (_name, body, code) => {
    expect(parseDeviceActivity(body, NOW)).toMatchObject({ ok: false, code });
  });

  it.each([
    ["a command that is not one", { "rm -rf": { uses: 1, successes: 0, lastUsedAt: AT() } }],
    ["more successes than uses", { commit: { uses: 1, successes: 2, lastUsedAt: AT() } }],
    ["a negative count", { commit: { uses: -1, successes: 0, lastUsedAt: AT() } }],
    ["a fractional count", { commit: { uses: 1.5, successes: 0, lastUsedAt: AT() } }],
    ["an absurd count", { commit: { uses: 1e9, successes: 0, lastUsedAt: AT() } }],
    ["a missing timestamp", { commit: { uses: 1, successes: 0 } }],
    ["a timestamp from 1970", { commit: { uses: 1, successes: 0, lastUsedAt: AT(-NOW) } }],
    [
      "a timestamp far in the future",
      { commit: { uses: 1, successes: 0, lastUsedAt: AT(10 * 24 * 3600_000) } },
    ],
  ])("rejects command stats with %s", (_name, commandStats) => {
    expect(parseDeviceActivity(payload({ commandStats }), NOW)).toMatchObject({
      ok: false,
      code: "invalid_command_stats",
    });
  });

  it("rejects hints that are not content keys or hint tokens", () => {
    for (const revealedHints of [
      { "lesson:git init": ["stage#0"] },
      { "course:git-basics": ["stage#0"] },
      { "lesson:git-init": ["stage"] },
      { "lesson:git-init": ["stage#notanumber"] },
      { "lesson:git-init": [1] },
      { "lesson:git-init": "stage#0" },
    ]) {
      expect(parseDeviceActivity(payload({ revealedHints }), NOW)).toMatchObject({
        ok: false,
        code: "invalid_hints",
      });
    }
  });

  it("caps how much one upload may carry", () => {
    const commandStats = Object.fromEntries(
      Array.from({ length: SYNC_LIMITS.commands + 1 }, (_, i) => [
        `cmd${"a".repeat(i % 20)}${String.fromCharCode(97 + (i % 26))}`,
        { uses: 1, successes: 0, lastUsedAt: AT() },
      ]),
    );
    expect(parseDeviceActivity(payload({ commandStats }), NOW).ok).toBe(false);
    const revealedHints = Object.fromEntries(
      Array.from({ length: SYNC_LIMITS.hintContentKeys + 1 }, (_, i) => [
        `lesson:l${String(i)}`,
        ["a#0"],
      ]),
    );
    expect(parseDeviceActivity(payload({ revealedHints }), NOW)).toMatchObject({
      ok: false,
      code: "invalid_hints",
    });
  });

  it("rejects a last lesson that is not a pair of content ids with a time", () => {
    for (const lastLesson of [
      { courseId: "git-basics", lessonId: "git-init" },
      { courseId: "Git Basics", lessonId: "git-init", visitedAt: AT() },
      { courseId: "git-basics", lessonId: "git-init", visitedAt: "yesterday" },
      "git-init",
    ]) {
      expect(parseDeviceActivity(payload({ lastLesson }), NOW)).toMatchObject({
        ok: false,
        code: "invalid_last_lesson",
      });
    }
    // Explicitly having no last lesson is fine.
    expect(parseDeviceActivity(payload({ lastLesson: null }), NOW).ok).toBe(true);
  });
});

describe("seen releases in an upload", () => {
  it("accepts release tags with the time each was first seen", () => {
    const parsed = parseDeviceActivity(
      payload({ schemaVersion: 3, seenReleases: { "v0.1.12": AT(-1000), "v0.1.11": AT(-9000) } }),
      NOW,
    );
    expect(parsed.ok && parsed.activity.seenReleases).toEqual({
      "v0.1.12": new Date(NOW - 1000),
      "v0.1.11": new Date(NOW - 9000),
    });
    // An older client sends none, which is the same as an empty set.
    const older = parseDeviceActivity(payload(), NOW);
    expect(older.ok && older.activity.seenReleases).toEqual({});
  });

  it.each([
    ["not an object", ["v0.1.12"]],
    ["a version that is not a release tag", { latest: AT() }],
    ["a tag with a suffix", { "v0.1.12-beta": AT() }],
    ["a missing time", { "v0.1.12": null }],
    ["a time far in the future", { "v0.1.12": AT(10 * 24 * 3600_000) }],
    [
      "too many releases",
      Object.fromEntries(
        Array.from({ length: SYNC_LIMITS.seenReleases + 1 }, (_, i) => [`v0.1.${String(i)}`, AT()]),
      ),
    ],
  ])("rejects %s", (_name, seenReleases) => {
    expect(parseDeviceActivity(payload({ seenReleases }), NOW)).toMatchObject({
      ok: false,
      code: "invalid_seen_releases",
    });
  });
});

describe("POST /api/progress/sync", () => {
  it("refuses cross-origin writes before it looks at the session", async () => {
    const store = createMemoryProgressStore();
    const verifyIdentity = vi.fn();
    const response = await syncProgress(postSync(payload(), { origin: "https://evil.example" }), {
      ...apiDeps(ADA, store),
      verifyIdentity,
    });
    expect(response.status).toBe(403);
    expect(verifyIdentity).not.toHaveBeenCalled();
    expect(store.rows.size).toBe(0);
  });

  it("refuses an unauthenticated write", async () => {
    const store = createMemoryProgressStore();
    const response = await syncProgress(
      postSync(payload()),
      apiDeps({ status: "unauthenticated" }, store),
    );
    expect(response.status).toBe(401);
    expect(store.rows.size).toBe(0);
  });

  it.each([
    // Measured before parsing, so the content does not matter, only the size.
    [413, "payload_too_large", "x".repeat(SYNC_LIMITS.bodyBytes + 1), undefined],
    [415, "unsupported_media_type", JSON.stringify(payload()), "text/plain"],
    [400, "invalid_json", "{", undefined],
  ])("answers %i %s", async (status, code, body, type) => {
    const response = await syncProgress(
      postSync(body, { headers: type ? { "content-type": type } : {} }),
      apiDeps(ADA),
    );
    expect(response.status).toBe(status);
    expect(await errorCode(response)).toBe(code);
  });

  it("answers 422 for a client that is ahead of this server", async () => {
    const response = await syncProgress(postSync(payload({ schemaVersion: 99 })), apiDeps(ADA));
    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe("unsupported_schema_version");
  });

  it("stores one device's activity and gives back the account's view of the others", async () => {
    const store = createMemoryProgressStore();
    const first = await syncProgress(postSync(payload()), apiDeps(ADA, store));
    expect(first.status).toBe(200);
    // Its own counters come back out: this device adds them itself.
    const activity = await activityOf(first);
    expect(activity.commandStats).toEqual({});
    expect(activity.playgroundSessions).toBe(0);
    // Hints and the last lesson are not per device, so they do come back.
    expect(activity.revealedHints).toEqual({ "lesson:git-init": ["stage#0"] });
    expect(activity.lastLesson).toMatchObject({ lessonId: "git-init" });
  });

  it("is idempotent: the same upload twice counts once", async () => {
    const store = createMemoryProgressStore();
    const deps = apiDeps(ADA, store);
    await syncProgress(postSync(payload()), deps);
    await syncProgress(postSync(payload()), deps);
    await syncProgress(postSync(payload()), deps);
    // A different device sees the one device's counters, not three times them.
    const other = await syncProgress(postSync(payload({ deviceId: "device-b" })), deps);
    const activity = await activityOf(other);
    expect(activity.commandStats.commit).toMatchObject({ uses: 3, successes: 2 });
    expect(activity.playgroundSessions).toBe(1);
  });

  it("sums counters across devices and never lowers one", async () => {
    const store = createMemoryProgressStore();
    const deps = apiDeps(ADA, store);
    await syncProgress(
      postSync(
        payload({
          deviceId: "laptop",
          commandStats: { commit: { uses: 10, successes: 9, lastUsedAt: AT(-5000) } },
          playgroundSessions: 2,
        }),
      ),
      deps,
    );
    await syncProgress(
      postSync(
        payload({
          deviceId: "phone",
          commandStats: { commit: { uses: 4, successes: 4, lastUsedAt: AT(-1000) } },
          playgroundSessions: 3,
        }),
      ),
      deps,
    );

    // The phone's view leaves out its own: 10 uses from the laptop.
    const phone = await activityOf(
      await syncProgress(postSync(payload({ deviceId: "phone", commandStats: {} })), deps),
    );
    expect(phone.commandStats.commit).toMatchObject({ uses: 10, successes: 9 });

    // A third device sees both.
    const tablet = await activityOf(
      await syncProgress(
        postSync(payload({ deviceId: "tablet", commandStats: {}, playgroundSessions: 0 })),
        deps,
      ),
    );
    expect(tablet.commandStats.commit).toMatchObject({ uses: 14, successes: 13 });
    expect(tablet.playgroundSessions).toBe(5);

    // An upload that arrives late with stale totals must not undo the newer ones.
    await syncProgress(
      postSync(
        payload({
          deviceId: "laptop",
          commandStats: { commit: { uses: 1, successes: 1, lastUsedAt: AT(-9000) } },
          playgroundSessions: 0,
        }),
      ),
      deps,
    );
    const after = await activityOf(
      await syncProgress(
        postSync(payload({ deviceId: "tablet", commandStats: {}, playgroundSessions: 0 })),
        deps,
      ),
    );
    expect(after.commandStats.commit).toMatchObject({ uses: 14 });
    expect(after.playgroundSessions).toBe(5);
  });

  it("merges hints as a set and keeps the most recent lesson visit", async () => {
    const store = createMemoryProgressStore();
    const deps = apiDeps(ADA, store);
    await syncProgress(
      postSync(
        payload({
          deviceId: "laptop",
          revealedHints: { "lesson:git-init": ["stage#0", "stage#1"] },
          lastLesson: { courseId: "git-basics", lessonId: "git-init", visitedAt: AT(-60_000) },
        }),
      ),
      deps,
    );
    const phone = await activityOf(
      await syncProgress(
        postSync(
          payload({
            deviceId: "phone",
            revealedHints: {
              "lesson:git-init": ["stage#0", "commit#0"],
              "challenge:detached-head": ["branch#0"],
            },
            lastLesson: { courseId: "git-basics", lessonId: "what-is-git", visitedAt: AT(-1000) },
          }),
        ),
        deps,
      ),
    );
    expect(phone.revealedHints["lesson:git-init"]?.sort()).toEqual([
      "commit#0",
      "stage#0",
      "stage#1",
    ]);
    expect(phone.revealedHints["challenge:detached-head"]).toEqual(["branch#0"]);
    // The newer visit wins, whichever device sent it.
    expect(phone.lastLesson).toMatchObject({ lessonId: "what-is-git" });

    // An older visit arriving afterwards does not move it back.
    const late = await activityOf(
      await syncProgress(
        postSync(
          payload({
            deviceId: "laptop",
            lastLesson: { courseId: "git-basics", lessonId: "git-init", visitedAt: AT(-120_000) },
          }),
        ),
        deps,
      ),
    );
    expect(late.lastLesson).toMatchObject({ lessonId: "what-is-git" });
  });

  it("merges seen releases as a set across devices, keeping the earliest time", async () => {
    const deps = apiDeps(ADA, createMemoryProgressStore());
    await syncProgress(
      postSync(payload({ deviceId: "laptop", seenReleases: { "v0.1.12": AT(-60_000) } })),
      deps,
    );
    // The phone never dismissed it, yet hears that the account has seen it.
    const phone = await activityOf(
      await syncProgress(postSync(payload({ deviceId: "phone" })), deps),
    );
    expect(phone.seenReleases).toEqual({ "v0.1.12": AT(-60_000) });

    // The same release seen later on the phone, and a retry: still one entry, earliest time.
    await syncProgress(
      postSync(payload({ deviceId: "phone", seenReleases: { "v0.1.12": AT(-1000) } })),
      deps,
    );
    const again = await activityOf(
      await syncProgress(
        postSync(payload({ deviceId: "laptop", seenReleases: { "v0.1.12": AT(-60_000) } })),
        deps,
      ),
    );
    expect(again.seenReleases).toEqual({ "v0.1.12": AT(-60_000) });

    // Another learner sees nothing of it.
    const other = await activityOf(
      await syncProgress(postSync(payload()), apiDeps(ADA_ELSEWHERE, createMemoryProgressStore())),
    );
    expect(other.seenReleases).toEqual({});
  });

  it("breaks a tie on the visit time deterministically, so devices agree", async () => {
    const store = createMemoryProgressStore();
    const deps = apiDeps(ADA, store);
    const at = AT(-1000);
    for (const lessonId of ["what-is-git", "git-init"]) {
      await syncProgress(
        postSync(
          payload({
            deviceId: lessonId,
            lastLesson: { courseId: "git-basics", lessonId, visitedAt: at },
          }),
        ),
        deps,
      );
    }
    const view = await activityOf(
      await syncProgress(postSync(payload({ deviceId: "third" })), deps),
    );
    // The higher lesson id wins, whichever order the uploads arrived in.
    expect(view.lastLesson).toMatchObject({ lessonId: "what-is-git", visitedAt: at });
  });

  it("keeps accounts apart, including the same subject in another organization", async () => {
    const store = createMemoryProgressStore();
    await syncProgress(postSync(payload({ deviceId: "shared" })), apiDeps(ADA, store));
    for (const other of [GRACE, ADA_ELSEWHERE]) {
      const view = await activityOf(
        await syncProgress(
          postSync(payload({ deviceId: "other", commandStats: {}, revealedHints: {} })),
          apiDeps(other, store),
        ),
      );
      expect(view.commandStats).toEqual({});
      expect(view.revealedHints).toEqual({});
    }
  });
});

describe("GET /api/progress", () => {
  it("leaves the asking device's own counters out of the sums", async () => {
    const store = createMemoryProgressStore();
    const deps = apiDeps(ADA, store);
    await syncProgress(postSync(payload({ deviceId: "laptop" })), deps);
    await syncProgress(postSync(payload({ deviceId: "phone" })), deps);

    const everything = await activityOf(await getProgress(deps, getRequest()));
    expect(everything.commandStats.commit).toMatchObject({ uses: 6 });

    const forLaptop = await activityOf(await getProgress(deps, getRequest("laptop")));
    expect(forLaptop.commandStats.commit).toMatchObject({ uses: 3 });
    expect(forLaptop.playgroundSessions).toBe(1);
  });

  it("ignores a device parameter that is not a device id", async () => {
    const store = createMemoryProgressStore();
    const deps = apiDeps(ADA, store);
    await syncProgress(postSync(payload({ deviceId: "laptop" })), deps);
    const view = await activityOf(await getProgress(deps, getRequest("not a device")));
    expect(view.commandStats.commit).toMatchObject({ uses: 3 });
  });
});
