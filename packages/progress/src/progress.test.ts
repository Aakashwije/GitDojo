import { type CourseOutline } from "@gitdojo/shared-types";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyProgressAction,
  commandSummary,
  completedLessonIds,
  continueLearning,
  courseProgress,
  createIndexedDbStorage,
  createMemoryStorage,
  dailyActivity,
  emptyProgress,
  exportFileName,
  exportProgress,
  hintsUsed,
  learningJourney,
  LEGACY_MIGRATION,
  LEGACY_STORAGE_KEY,
  migrateLegacyProgress,
  NewerProgressVersionError,
  parseLegacyProgress,
  parseProgress,
  PROGRESS_SCHEMA_VERSION,
  ProgressRepository,
  recentActivity,
  totalHintsUsed,
  withRemoteCounters,
  type LegacyStorage,
  type LocalProgress,
  type ProgressAction,
  buildProgressReport,
  isSkillId,
  normalizeConcept,
  normalizeLearnerName,
  pickSurpriseTask,
  recommendNextSteps,
  skillForConcept,
  skillNextActions,
  skillProgress,
  SKILLS,
  skillsForConcepts,
  type ProgressCatalog,
  type ProgressChannel,
  type ProgressStorage,
} from "./index";

const COURSES: CourseOutline[] = [
  {
    id: "git-basics",
    slug: "git-basics",
    title: "Git Basics",
    description: "",
    difficulty: "beginner",
    lessons: [
      { id: "what-is-git", slug: "what-is-git", title: "What Is Git?", type: "concept", number: 1 },
      { id: "git-init", slug: "git-init", title: "git init", type: "interactive", number: 2 },
      {
        id: "first-repository-challenge",
        slug: "first-repository-challenge",
        title: "Challenge",
        type: "challenge",
        number: 3,
      },
    ],
  },
  {
    id: "branching",
    slug: "branching",
    title: "Branching",
    description: "",
    difficulty: "beginner",
    lessons: [
      { id: "git-branch", slug: "git-branch", title: "git branch", type: "interactive", number: 1 },
    ],
  },
];

const CATALOG: ProgressCatalog = {
  courses: COURSES,
  lessons: [{ id: "first-commit", title: "Your First Commit", type: "interactive" }],
  challenges: [
    { id: "first-commit", title: "First Commit" },
    { id: "lost-commit", title: "Lost Commit" },
  ],
  practice: [
    {
      id: "start-a-branch",
      title: "Start a Feature Branch",
      skill: "branches",
      difficulty: "beginner",
    },
    {
      id: "rescue-a-reset",
      title: "Rescue a Reset",
      skill: "recovery",
      difficulty: "intermediate",
    },
  ],
  concepts: {
    "lesson:what-is-git": ["version-control"],
    "lesson:git-init": ["git-init", "repositories"],
    "lesson:first-repository-challenge": ["git-init", "staging", "commits"],
    "lesson:git-branch": ["branches", "git-branch"],
    "lesson:first-commit": ["git-init", "staging", "commits"],
    "challenge:first-commit": ["staging", "commits"],
    "challenge:lost-commit": ["reflog", "recovery"],
    "practice:start-a-branch": ["branches", "commits"],
    "practice:rescue-a-reset": ["reflog"],
  },
};

const T0 = 1_700_000_000_000;

function reduce(actions: ProgressAction[], start: LocalProgress = emptyProgress(T0)) {
  return actions.reduce((progress, action, index) => {
    return applyProgressAction(progress, action, T0 + (index + 1) * 1000);
  }, start);
}

const lesson = (id: string, type: "concept" | "interactive" | "challenge", courseId?: string) =>
  ({
    type: "complete",
    content: { kind: "lesson", id, type, ...(courseId ? { courseId } : {}) },
  }) as const;
const challenge = (id: string) =>
  ({ type: "complete", content: { kind: "challenge", id } }) as const;

function memoryLegacy(initial: Record<string, string> = {}): LegacyStorage & {
  items: Map<string, string>;
} {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

/** An in-memory stand-in for BroadcastChannel that delivers to every other member. */
function createHub() {
  type Listener = (event: { data: unknown }) => void;
  const members = new Set<{ listeners: Set<Listener> }>();
  return () => {
    const member = { listeners: new Set<Listener>() };
    members.add(member);
    const channel: ProgressChannel = {
      postMessage: (data) => {
        for (const other of members) {
          if (other === member) continue;
          for (const listener of other.listeners) listener({ data });
        }
      },
      addEventListener: (_type, listener) => member.listeners.add(listener),
      removeEventListener: (_type, listener) => member.listeners.delete(listener),
      close: () => members.delete(member),
    };
    return channel;
  };
}

describe("XP and completion", () => {
  it("awards completion XP by lesson type on first completion", () => {
    const progress = reduce([
      lesson("what-is-git", "concept", "git-basics"),
      lesson("git-init", "interactive", "git-basics"),
      lesson("first-repository-challenge", "challenge", "git-basics"),
      challenge("lost-commit"),
    ]);
    expect(progress.completedLessons["what-is-git"]?.xp).toBe(25);
    expect(progress.completedLessons["git-init"]?.xp).toBe(50);
    expect(progress.completedLessons["first-repository-challenge"]?.xp).toBe(100);
    expect(progress.completedChallenges["lost-commit"]?.xp).toBe(100);
    expect(progress.xp).toBe(275);
  });

  it("does not award XP again when a lesson is replayed", () => {
    const once = reduce([lesson("git-init", "interactive")]);
    const again = applyProgressAction(once, lesson("git-init", "interactive"), T0 + 99_000);
    expect(again).toBe(once);
    expect(again.xp).toBe(50);
    expect(again.completedLessons["git-init"]?.completedAt).toBe(T0 + 1000);
  });

  it("keeps course challenge lessons and standalone challenges in separate namespaces", () => {
    // The demo lesson and a standalone challenge share the id `first-commit`.
    const progress = reduce([
      lesson("first-commit", "interactive"),
      challenge("first-commit"),
      challenge("first-commit"),
      lesson("first-repository-challenge", "challenge", "git-basics"),
      lesson("first-repository-challenge", "challenge", "git-basics"),
    ]);
    expect(Object.keys(progress.completedLessons).sort()).toEqual([
      "first-commit",
      "first-repository-challenge",
    ]);
    expect(Object.keys(progress.completedChallenges)).toEqual(["first-commit"]);
    // 50 (lesson) + 100 (standalone challenge) + 100 (course challenge lesson), each once.
    expect(progress.xp).toBe(250);
  });

  it("does not penalize hints", () => {
    const progress = reduce([
      { type: "hint", content: { kind: "lesson", id: "git-init" }, objectiveId: "init", index: 0 },
      { type: "hint", content: { kind: "lesson", id: "git-init" }, objectiveId: "init", index: 1 },
      lesson("git-init", "interactive"),
    ]);
    expect(progress.xp).toBe(50);
  });
});

describe("account lessons", () => {
  const ACCOUNT = {
    "what-is-git": { completedAt: T0 - 50_000, xp: 25, type: "concept", courseId: "git-basics" },
    "git-init": { completedAt: T0 - 40_000, xp: 50, type: "interactive", courseId: "git-basics" },
  } as const;

  it("adopts the account's completions, keeping its first completion time and XP", () => {
    const local = reduce([lesson("git-init", "interactive", "git-basics")]);
    const synced = applyProgressAction(local, { type: "account-lessons", lessons: ACCOUNT }, T0);
    expect(synced.completedLessons["git-init"]).toEqual(ACCOUNT["git-init"]);
    expect(synced.completedLessons["what-is-git"]).toEqual(ACCOUNT["what-is-git"]);
    expect(synced.xp).toBe(75);
  });

  it("keeps lessons completed only here until they are uploaded", () => {
    const local = reduce([lesson("staging-area", "concept", "git-basics")]);
    const synced = applyProgressAction(local, { type: "account-lessons", lessons: ACCOUNT }, T0);
    expect(Object.keys(synced.completedLessons).sort()).toEqual([
      "git-init",
      "staging-area",
      "what-is-git",
    ]);
    expect(synced.xp).toBe(100);
  });

  it("changes nothing when the record already matches", () => {
    const synced = applyProgressAction(
      emptyProgress(T0),
      { type: "account-lessons", lessons: ACCOUNT },
      T0,
    );
    const again = applyProgressAction(synced, { type: "account-lessons", lessons: ACCOUNT }, T0);
    expect(again).toBe(synced);
  });
});

describe("command and hint counting", () => {
  it("counts uses and successes per command", () => {
    const progress = reduce([
      { type: "command", command: "commit", ok: false },
      { type: "command", command: "commit", ok: true },
      { type: "command", command: "add", ok: true },
      { type: "command", command: "cherry-pick", ok: true },
    ]);
    expect(progress.commandStats.commit).toMatchObject({ uses: 2, successes: 1 });
    expect(commandSummary(progress)).toMatchObject({
      uses: 4,
      successes: 3,
      commands: [
        { command: "commit", uses: 2, successes: 1 },
        { command: "add", uses: 1, successes: 1 },
        { command: "cherry-pick", uses: 1, successes: 1 },
      ],
    });
  });

  it("ignores command names that are not Git subcommands", () => {
    const start = emptyProgress(T0);
    for (const command of ["", "Commit", "rm -rf", "__proto__", "x".repeat(40)]) {
      expect(applyProgressAction(start, { type: "command", command, ok: true }, T0)).toBe(start);
    }
  });

  it("counts each hint once, however often it is revealed again", () => {
    const hint = (id: string, objectiveId: string, index: number): ProgressAction => ({
      type: "hint",
      content: { kind: "lesson", id },
      objectiveId,
      index,
    });
    const progress = reduce([
      hint("git-init", "init", 0),
      hint("git-init", "init", 0),
      hint("git-init", "init", 1),
      // After "Practice again" the panel starts over; the same hints are not new.
      hint("git-init", "init", 0),
      hint("git-init", "init", 1),
      hint("git-init", "verify", 0),
      {
        type: "hint",
        content: { kind: "challenge", id: "git-init" },
        objectiveId: "init",
        index: 0,
      },
    ]);
    expect(hintsUsed(progress)).toEqual({ "lesson:git-init": 3, "challenge:git-init": 1 });
    expect(totalHintsUsed(progress)).toBe(4);
  });

  it("counts playground sessions and remembers the last lesson", () => {
    const progress = reduce([
      { type: "playground-session" },
      { type: "playground-session" },
      { type: "visit-lesson", courseId: "branching", lessonId: "git-branch" },
    ]);
    expect(progress.playgroundSessions).toBe(2);
    expect(progress.lastLesson).toMatchObject({ courseId: "branching", lessonId: "git-branch" });
  });
});

describe("course progress and continue learning", () => {
  it("derives course completion from completed lessons in the current content", () => {
    const completed = new Set(["what-is-git", "git-init", "removed-lesson"]);
    expect(courseProgress(COURSES[0] as CourseOutline, completed)).toEqual({
      completedCount: 2,
      total: 3,
      percent: 67,
    });
    expect(courseProgress({ lessons: [] }, completed).percent).toBe(0);
  });

  it("starts at the first lesson for a new learner", () => {
    expect(continueLearning(emptyProgress(T0), COURSES)).toMatchObject({
      reason: "start",
      lesson: { id: "what-is-git" },
    });
  });

  it("resumes the last visited lesson until it is complete, then moves on", () => {
    const visited = reduce([
      { type: "visit-lesson", courseId: "git-basics", lessonId: "git-init" },
    ]);
    expect(continueLearning(visited, COURSES)).toMatchObject({
      reason: "resume",
      lesson: { id: "git-init" },
    });
    const done = reduce([lesson("git-init", "interactive", "git-basics")], visited);
    expect(continueLearning(done, COURSES)).toMatchObject({
      reason: "next",
      lesson: { id: "what-is-git" },
    });
  });

  it("falls back safely when the last lesson was removed or moved", () => {
    const removed = reduce([{ type: "visit-lesson", courseId: "gone", lessonId: "gone-lesson" }]);
    expect(continueLearning(removed, COURSES)).toMatchObject({ lesson: { id: "what-is-git" } });
    // Same lesson id, now in another course: found by id.
    const moved = reduce([
      { type: "visit-lesson", courseId: "git-basics", lessonId: "git-branch" },
    ]);
    expect(continueLearning(moved, COURSES)).toMatchObject({
      reason: "resume",
      course: { id: "branching" },
      lesson: { id: "git-branch" },
    });
  });

  it("returns null once everything is complete", () => {
    const all = reduce(
      COURSES.flatMap((course) =>
        course.lessons.map((l) => lesson(l.id, l.type, course.id) as ProgressAction),
      ),
    );
    expect(continueLearning(all, COURSES)).toBeNull();
  });

  it("lists recent activity newest first with current titles", () => {
    const progress = reduce([
      lesson("git-init", "interactive", "git-basics"),
      challenge("lost-commit"),
      lesson("deleted", "interactive"),
    ]);
    const items = recentActivity(progress, CATALOG);
    expect(items.map((item) => item.title)).toEqual(["deleted", "Lost Commit", "git init"]);
    expect(items[0]).toMatchObject({ available: false });
    expect(items[2]).toMatchObject({ course: { slug: "git-basics" }, lessonSlug: "git-init" });
  });
});

describe("legacy migration", () => {
  const legacyJson = JSON.stringify({
    state: {
      completedLessons: { "what-is-git": true, "git-init": true, "removed-lesson": true },
      completedChallenges: { "lost-commit": true },
    },
    version: 2,
  });

  it("parses both legacy versions", () => {
    expect(parseLegacyProgress(legacyJson)).toEqual({
      completedLessons: ["what-is-git", "git-init", "removed-lesson"],
      completedChallenges: ["lost-commit"],
    });
    const v1 = JSON.stringify({ state: { completedLessons: { "git-init": true } }, version: 1 });
    expect(parseLegacyProgress(v1)).toEqual({
      completedLessons: ["git-init"],
      completedChallenges: [],
    });
    expect(parseLegacyProgress("not json")).toBeNull();
    expect(parseLegacyProgress(null)).toBeNull();
  });

  it("preserves completions and awards their XP once", () => {
    const migrated = migrateLegacyProgress(
      emptyProgress(T0),
      parseLegacyProgress(legacyJson),
      CATALOG,
      T0,
    );
    expect(completedLessonIds(migrated)).toEqual(
      new Set(["what-is-git", "git-init", "removed-lesson"]),
    );
    expect(migrated.completedLessons["git-init"]).toMatchObject({ xp: 50, migrated: true });
    // Removed content is kept but earns nothing.
    expect(migrated.completedLessons["removed-lesson"]).toMatchObject({ xp: 0 });
    expect(migrated.xp).toBe(25 + 50 + 100);
    expect(migrated.migrations[LEGACY_MIGRATION]).toBe(T0);
  });

  it("is safe to repeat and never overrides existing records", () => {
    const existing = reduce([lesson("git-init", "interactive", "git-basics")]);
    const legacy = parseLegacyProgress(legacyJson);
    const once = migrateLegacyProgress(existing, legacy, CATALOG, T0 + 5000);
    const twice = migrateLegacyProgress(once, legacy, CATALOG, T0 + 9000);
    expect(twice).toBe(once);
    expect(once.completedLessons["git-init"]).toEqual(existing.completedLessons["git-init"]);
    expect(once.xp).toBe(175);
  });
});

describe("parsing stored data", () => {
  it("round-trips valid progress unchanged", () => {
    const progress = reduce([lesson("git-init", "interactive"), { type: "playground-session" }]);
    expect(parseProgress(structuredClone(progress), T0)).toEqual({ progress, issues: [] });
  });

  it("salvages valid entries from malformed data and recomputes XP", () => {
    const { progress, issues } = parseProgress(
      {
        schemaVersion: 1,
        owner: { kind: "anonymous" },
        deviceId: "device-1",
        completedLessons: {
          "git-init": { completedAt: T0, xp: 50, type: "interactive" },
          broken: { completedAt: "yesterday" },
        },
        completedChallenges: "nope",
        xp: 999_999,
        commandStats: { commit: { uses: 2, successes: 5 }, add: null },
        revealedHints: { "lesson:git-init": ["init#0", "init#0", 3] },
        playgroundSessions: -4,
        lastLesson: { courseId: 1 },
      },
      T0,
    );
    expect(progress.completedLessons).toEqual({
      "git-init": { completedAt: T0, xp: 50, type: "interactive" },
    });
    expect(progress.completedChallenges).toEqual({});
    expect(progress.xp).toBe(50);
    expect(progress.commandStats).toEqual({ commit: { uses: 2, successes: 2, lastUsedAt: 0 } });
    expect(progress.revealedHints).toEqual({ "lesson:git-init": ["init#0"] });
    expect(progress.playgroundSessions).toBe(0);
    expect(progress.lastLesson).toBeUndefined();
    expect(progress.deviceId).toBe("device-1");
    expect(issues.length).toBeGreaterThan(0);
  });

  it("does not crash on garbage", () => {
    for (const raw of [null, 42, "progress", [], { schemaVersion: "x" }]) {
      expect(() => parseProgress(raw, T0)).not.toThrow();
    }
  });
});

describe("ProgressRepository", () => {
  let factory: IDBFactory;
  let storage: ProgressStorage;
  let clock: number;
  const now = () => (clock += 1);

  beforeEach(() => {
    factory = new IDBFactory();
    storage = createIndexedDbStorage(factory);
    clock = T0;
  });

  const repository = (options: Partial<ConstructorParameters<typeof ProgressRepository>[0]> = {}) =>
    new ProgressRepository({ storage, catalog: CATALOG, now, ...options });

  it("restores progress after a reload", async () => {
    const tab = repository();
    await tab.load();
    await tab.apply(lesson("git-init", "interactive", "git-basics"));
    await tab.apply({ type: "command", command: "init", ok: true });

    // A reload: a new connection and repository over the same database.
    const reloaded = repository({ storage: createIndexedDbStorage(factory) });
    const { progress, persistence, issues } = await reloaded.load();
    expect(persistence).toEqual({ mode: "saved" });
    expect(issues).toEqual([]);
    expect(progress.completedLessons["git-init"]).toMatchObject({ xp: 50 });
    expect(progress.commandStats.init).toMatchObject({ uses: 1, successes: 1 });
    expect(progress.xp).toBe(50);
  });

  it("keeps anonymous progress and each account's progress apart", async () => {
    const anonymous = repository();
    await anonymous.load();
    await anonymous.apply(lesson("what-is-git", "concept", "git-basics"));

    const ada = repository({ owner: { kind: "account", accountId: "ada" } });
    const adaLoaded = await ada.load();
    expect(adaLoaded.progress.owner).toEqual({ kind: "account", accountId: "ada" });
    expect(adaLoaded.progress.completedLessons).toEqual({});
    await ada.apply(lesson("git-init", "interactive", "git-basics"));

    const grace = repository({ owner: { kind: "account", accountId: "grace" } });
    expect((await grace.load()).progress.xp).toBe(0);

    const anonymousAgain = await repository({ storage: createIndexedDbStorage(factory) }).load();
    expect(Object.keys(anonymousAgain.progress.completedLessons)).toEqual(["what-is-git"]);
    const adaAgain = await repository({
      storage: createIndexedDbStorage(factory),
      owner: { kind: "account", accountId: "ada" },
    }).load();
    expect(Object.keys(adaAgain.progress.completedLessons)).toEqual(["git-init"]);
  });

  it("migrates legacy progress once and removes the legacy copy", async () => {
    const legacy = memoryLegacy({
      [LEGACY_STORAGE_KEY]: JSON.stringify({
        state: { completedLessons: { "git-init": true }, completedChallenges: {} },
        version: 2,
      }),
    });
    const first = await repository({ legacy }).load();
    expect(first.progress.completedLessons["git-init"]).toMatchObject({ migrated: true, xp: 50 });
    expect(legacy.items.has(LEGACY_STORAGE_KEY)).toBe(false);

    // Even if the legacy entry came back (an old tab still open), it is not imported again.
    legacy.items.set(
      LEGACY_STORAGE_KEY,
      JSON.stringify({ state: { completedLessons: { "what-is-git": true } }, version: 2 }),
    );
    const second = await repository({ legacy }).load();
    expect(Object.keys(second.progress.completedLessons)).toEqual(["git-init"]);
    expect(second.progress.xp).toBe(50);
  });

  it("does not lose concurrent updates from two tabs", async () => {
    const tabA = repository();
    const tabB = repository({ storage: createIndexedDbStorage(factory) });
    await Promise.all([tabA.load(), tabB.load()]);

    const updates: Promise<LocalProgress>[] = [];
    for (let i = 0; i < 20; i += 1) {
      updates.push(tabA.apply({ type: "command", command: "status", ok: true }));
      updates.push(tabB.apply({ type: "command", command: "status", ok: i % 2 === 0 }));
    }
    updates.push(tabA.apply(lesson("git-init", "interactive")));
    updates.push(tabB.apply(challenge("lost-commit")));
    await Promise.all(updates);

    const { progress } = await repository({ storage: createIndexedDbStorage(factory) }).load();
    expect(progress.commandStats.status).toMatchObject({ uses: 40, successes: 30 });
    expect(progress.xp).toBe(150);
    expect(progress.revision).toBeGreaterThanOrEqual(42);
  });

  it("writes a burst of activity in at most two transactions", async () => {
    let writes = 0;
    const counting: ProgressStorage = {
      ...storage,
      kind: "indexeddb",
      read: (key) => storage.read(key),
      write: (key, value) => storage.write(key, value),
      update: (key, change) => {
        writes += 1;
        return storage.update(key, change);
      },
    };
    const tab = repository({ storage: counting });
    await tab.load();
    writes = 0;
    const results = await Promise.all([
      ...Array.from({ length: 8 }, () => tab.apply({ type: "command", command: "add", ok: true })),
      tab.apply(lesson("git-init", "interactive")),
    ]);
    expect(writes).toBeLessThanOrEqual(2);
    // Every caller sees a result that includes its own change.
    expect(results.at(-1)?.commandStats.add?.uses).toBe(8);
    expect(results.at(-1)?.xp).toBe(50);
  });

  it("applies a stale tab's change on top of newer progress", async () => {
    const stale = repository();
    await stale.load();
    const other = repository({ storage: createIndexedDbStorage(factory) });
    await other.apply(lesson("git-init", "interactive"));
    // The stale tab never saw that completion, but its write keeps it.
    const result = await stale.apply({ type: "playground-session" });
    expect(result.completedLessons["git-init"]).toBeDefined();
    expect(result.playgroundSessions).toBe(1);
  });

  it("tells other tabs about changes", async () => {
    const channelFor = createHub();
    const tabA = repository({ channel: channelFor() });
    const tabB = repository({ storage: createIndexedDbStorage(factory), channel: channelFor() });
    await Promise.all([tabA.load(), tabB.load()]);
    const seen = new Promise<LocalProgress>((resolve) => {
      tabB.subscribe(resolve);
    });
    await tabA.apply(challenge("lost-commit"));
    expect((await seen).completedChallenges["lost-commit"]).toBeDefined();
  });

  it("falls back to memory when IndexedDB is unavailable", async () => {
    const broken: IDBFactory = {
      open: () => {
        throw new DOMException("denied", "SecurityError");
      },
    } as unknown as IDBFactory;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tab = repository({ storage: createIndexedDbStorage(broken) });
    const { persistence } = await tab.load();
    expect(persistence.mode).toBe("memory");
    // Learning carries on for the visit.
    const after = await tab.apply(lesson("git-init", "interactive"));
    expect(after.xp).toBe(50);
    warn.mockRestore();
  });

  it("keeps legacy progress in memory mode, where it is the only saved copy", async () => {
    const legacy = memoryLegacy({
      [LEGACY_STORAGE_KEY]: JSON.stringify({ state: { completedLessons: { "git-init": true } } }),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failing: ProgressStorage = {
      kind: "indexeddb",
      read: () => Promise.reject(new Error("QuotaExceededError")),
      update: () => Promise.reject(new Error("QuotaExceededError")),
      write: () => Promise.reject(new Error("QuotaExceededError")),
    };
    const { progress, persistence } = await repository({ storage: failing, legacy }).load();
    expect(persistence.mode).toBe("memory");
    expect(progress.completedLessons["git-init"]).toBeDefined();
    expect(legacy.items.has(LEGACY_STORAGE_KEY)).toBe(true);
    warn.mockRestore();
  });

  it("rejects a failed save so the caller can report it", async () => {
    let fail = false;
    const flaky: ProgressStorage = {
      ...createMemoryStorage(),
      kind: "indexeddb",
      update(key, change) {
        return fail ? Promise.reject(new Error("disk full")) : memory.update(key, change);
      },
    };
    const memory = createMemoryStorage();
    const tab = repository({ storage: flaky });
    await tab.load();
    fail = true;
    await expect(tab.apply({ type: "playground-session" })).rejects.toThrow("disk full");
    // The queue keeps working afterwards.
    fail = false;
    await expect(tab.apply({ type: "playground-session" })).resolves.toMatchObject({
      playgroundSessions: 1,
    });
  });

  it("repairs malformed stored data and keeps a copy of the original", async () => {
    await storage.write("anonymous", {
      schemaVersion: 1,
      completedLessons: { "git-init": { completedAt: T0, xp: 50 }, bad: 7 },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { progress, issues } = await repository().load();
    expect(Object.keys(progress.completedLessons)).toEqual(["git-init"]);
    expect(issues.length).toBeGreaterThan(0);
    const reread = parseProgress(await storage.read("anonymous"), T0);
    expect(reread.issues).toEqual([]);
    warn.mockRestore();
  });

  it("leaves progress from a newer schema untouched", async () => {
    const newer = { schemaVersion: 99, completedLessons: { "git-init": { future: true } } };
    await storage.write("anonymous", newer);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { persistence } = await repository().load();
    expect(persistence.mode).toBe("memory");
    expect(await storage.read("anonymous")).toEqual(newer);
    warn.mockRestore();
  });

  it("resets learning progress only", async () => {
    // Lesson and playground repositories live in another database (LightningFS's).
    const other = createIndexedDbStorage(factory, "gitdojo-repositories-test");
    await other.write("playground", { files: ["README.md"] });
    const legacy = memoryLegacy({ "gitdojo:playground": '{"state":{"scenarioId":"simple"}}' });

    const tab = repository({ legacy });
    const { progress: before } = await tab.load();
    await tab.apply(lesson("git-init", "interactive"));
    await tab.apply({ type: "command", command: "init", ok: true });
    await tab.apply({ type: "playground-session" });
    legacy.items.set(LEGACY_STORAGE_KEY, "{}");

    const after = await tab.reset();
    expect(after).toMatchObject({
      completedLessons: {},
      completedChallenges: {},
      xp: 0,
      commandStats: {},
      revealedHints: {},
      playgroundSessions: 0,
      deviceId: before.deviceId,
    });
    expect(after.migrations[LEGACY_MIGRATION]).toBeDefined();
    expect(after.resetAt).toBeDefined();
    expect(await other.read("playground")).toEqual({ files: ["README.md"] });
    expect(legacy.items.get("gitdojo:playground")).toBeDefined();
    expect(legacy.items.has(LEGACY_STORAGE_KEY)).toBe(false);

    // A reload shows the reset.
    const reloaded = await repository({ storage: createIndexedDbStorage(factory) }).load();
    expect(reloaded.progress.xp).toBe(0);
  });
});

describe("export", () => {
  it("wraps progress in a versioned envelope", () => {
    const progress = reduce([lesson("git-init", "interactive")]);
    const data = exportProgress(progress, Date.UTC(2026, 9, 4));
    expect(data).toMatchObject({
      format: "gitdojo-progress",
      exportVersion: 1,
      exportedAt: "2026-10-04T00:00:00.000Z",
      progress: { schemaVersion: PROGRESS_SCHEMA_VERSION, xp: 50 },
    });
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    expect(exportFileName(Date.UTC(2026, 9, 4))).toBe("gitdojo-progress-2026-10-04.json");
  });

  it("never contains credentials", () => {
    const json = JSON.stringify(exportProgress(emptyProgress(T0), T0));
    expect(json).not.toMatch(/token|password|secret/i);
  });
});

describe("account sync", () => {
  const counters = (uses: number, sessions: number) => ({
    commandStats: { commit: { uses, successes: uses, lastUsedAt: 1_000 } },
    playgroundSessions: sessions,
  });

  it("keeps this device's counters separate and adds the account's for display", () => {
    let progress = reduce([
      { type: "command", command: "commit", ok: true },
      { type: "command", command: "commit", ok: false },
      { type: "playground-session" },
    ]);
    progress = applyProgressAction(
      progress,
      { type: "account-sync", counters: counters(7, 3) },
      2_000,
    );
    // The record keeps what this device did, so its next upload is still its own total.
    expect(progress.commandStats.commit).toMatchObject({ uses: 2, successes: 1 });
    expect(progress.playgroundSessions).toBe(1);
    // The learner sees both.
    const merged = withRemoteCounters(progress);
    expect(merged.commandStats.commit).toMatchObject({ uses: 9, successes: 8 });
    expect(merged.playgroundSessions).toBe(4);
  });

  it("replaces the account's counters rather than accumulating them", () => {
    let progress = applyProgressAction(
      emptyProgress(0),
      { type: "account-sync", counters: counters(5, 1) },
      1,
    );
    progress = applyProgressAction(progress, { type: "account-sync", counters: counters(5, 1) }, 2);
    expect(withRemoteCounters(progress).commandStats.commit).toMatchObject({ uses: 5 });
    expect(withRemoteCounters(progress).playgroundSessions).toBe(1);
  });

  it("merges hints as a set, so one revealed anywhere stays revealed", () => {
    let progress = reduce([
      { type: "hint", content: { kind: "lesson", id: "git-init" }, objectiveId: "stage", index: 0 },
    ]);
    progress = applyProgressAction(
      progress,
      {
        type: "account-sync",
        counters: counters(0, 0),
        revealedHints: {
          "lesson:git-init": ["stage#0", "stage#1"],
          "challenge:detached-head": ["branch#0"],
        },
      },
      5_000,
    );
    expect(progress.revealedHints["lesson:git-init"]?.sort()).toEqual(["stage#0", "stage#1"]);
    expect(progress.revealedHints["challenge:detached-head"]).toEqual(["branch#0"]);
    expect(totalHintsUsed(progress)).toBe(3);
  });

  it("takes the most recent lesson visit, and breaks a tie the same way everywhere", () => {
    const visited = (lessonId: string, visitedAt: number) => ({
      type: "account-sync" as const,
      counters: counters(0, 0),
      lastLesson: { courseId: "git-basics", lessonId, visitedAt },
    });
    let progress = applyProgressAction(emptyProgress(0), visited("git-init", 2_000), 1);
    // An older visit from another device does not move it back.
    progress = applyProgressAction(progress, visited("what-is-git", 1_000), 2);
    expect(progress.lastLesson).toMatchObject({ lessonId: "git-init" });
    // A newer one does.
    progress = applyProgressAction(progress, visited("what-is-git", 3_000), 3);
    expect(progress.lastLesson).toMatchObject({ lessonId: "what-is-git" });
    // Same instant: the higher lesson id wins, so two devices settle on one answer.
    progress = applyProgressAction(progress, visited("zzz-lesson", 3_000), 4);
    expect(progress.lastLesson).toMatchObject({ lessonId: "zzz-lesson" });
    progress = applyProgressAction(progress, visited("aaa-lesson", 3_000), 5);
    expect(progress.lastLesson).toMatchObject({ lessonId: "zzz-lesson" });
  });

  it("changes nothing, and does not touch the record, when there is nothing new", () => {
    const progress = applyProgressAction(
      emptyProgress(0),
      { type: "account-sync", counters: counters(2, 1), syncedAt: 10 },
      1,
    );
    const again = applyProgressAction(
      progress,
      { type: "account-sync", counters: counters(2, 1), syncedAt: 10 },
      2,
    );
    expect(again).toBe(progress);
    expect(again.revision).toBe(progress.revision);
  });

  it("records when the account confirmed this device, never before", () => {
    const progress = applyProgressAction(
      emptyProgress(0),
      { type: "account-sync", counters: counters(0, 0), syncedAt: 1_234 },
      1,
    );
    expect(progress.syncedAt).toBe(1_234);
    // A reset forgets it along with everything else learning-related.
    expect(applyProgressAction(progress, { type: "reset" }, 2).syncedAt).toBeUndefined();
  });
});

describe("schema versions", () => {
  it("upgrades a version 1 record without losing or re-counting anything", () => {
    const v1 = {
      schemaVersion: 1,
      owner: { kind: "account", accountId: "ada" },
      deviceId: "laptop",
      completedLessons: { "git-init": { completedAt: 10, xp: 50, type: "interactive" } },
      completedChallenges: {},
      xp: 50,
      commandStats: { commit: { uses: 3, successes: 2, lastUsedAt: 20 } },
      revealedHints: { "lesson:git-init": ["stage#0"] },
      playgroundSessions: 2,
      migrations: {},
      createdAt: 1,
      updatedAt: 20,
      revision: 4,
    };
    const { progress, issues } = parseProgress(v1, 100);
    expect(issues).toEqual([]);
    expect(progress.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
    expect(progress.commandStats.commit).toMatchObject({ uses: 3, successes: 2 });
    expect(progress.playgroundSessions).toBe(2);
    // Nothing has been synced yet, so there is nothing from other devices to add.
    expect(progress.remoteCounters).toBeUndefined();
    expect(withRemoteCounters(progress).playgroundSessions).toBe(2);
  });

  it("keeps synced counters across a round trip, and repairs a broken one", () => {
    const stored = {
      ...emptyProgress(0),
      remoteCounters: {
        commandStats: { commit: { uses: 4, successes: 9, lastUsedAt: 5 } },
        playgroundSessions: 2,
      },
      syncedAt: 50,
    };
    const { progress } = parseProgress(JSON.parse(JSON.stringify(stored)), 100);
    // Successes can never exceed uses, here as anywhere else.
    expect(progress.remoteCounters?.commandStats.commit).toMatchObject({ uses: 4, successes: 4 });
    expect(progress.syncedAt).toBe(50);

    const broken = parseProgress({ ...stored, remoteCounters: "nope" }, 100);
    expect(broken.issues).toContain("remoteCounters was not an object");
    expect(broken.progress.remoteCounters).toBeUndefined();
  });

  it("still refuses a record from a newer GitDojo", () => {
    expect(() => parseProgress({ schemaVersion: PROGRESS_SCHEMA_VERSION + 1 }, 0)).toThrow(
      NewerProgressVersionError,
    );
  });
});

describe("seen releases", () => {
  it("records the first time a release was seen, and nothing for a repeat or a bad version", () => {
    let progress = applyProgressAction(
      emptyProgress(0),
      { type: "see-release", version: "v0.1.12" },
      100,
    );
    expect(progress.seenReleases).toEqual({ "v0.1.12": 100 });
    const again = applyProgressAction(progress, { type: "see-release", version: "v0.1.12" }, 200);
    expect(again).toBe(progress);
    for (const version of ["", "latest", "0.1.12", "v0.1.12-beta", "v0.1.12 "]) {
      expect(applyProgressAction(progress, { type: "see-release", version }, 300)).toBe(progress);
    }
    // A later release is a separate entry, so it gets its own announcement.
    progress = applyProgressAction(progress, { type: "see-release", version: "v0.1.13" }, 400);
    expect(progress.seenReleases).toEqual({ "v0.1.12": 100, "v0.1.13": 400 });
  });

  it("merges the account's seen releases as a set, keeping the earliest time", () => {
    let progress = applyProgressAction(
      emptyProgress(0),
      { type: "see-release", version: "v0.1.12" },
      500,
    );
    progress = applyProgressAction(
      progress,
      {
        type: "account-sync",
        seenReleases: { "v0.1.12": 300, "v0.1.11": 100, "not-a-version": 50 },
      },
      600,
    );
    expect(progress.seenReleases).toEqual({ "v0.1.12": 300, "v0.1.11": 100 });
    // A later reply with a later time (another device) changes nothing.
    const again = applyProgressAction(
      progress,
      { type: "account-sync", seenReleases: { "v0.1.12": 900 } },
      700,
    );
    expect(again).toBe(progress);
  });

  it("survives a progress reset, because it is not learning progress", () => {
    const seen = applyProgressAction(
      emptyProgress(0),
      { type: "see-release", version: "v0.1.12" },
      100,
    );
    expect(applyProgressAction(seen, { type: "reset" }, 200).seenReleases).toEqual({
      "v0.1.12": 100,
    });
  });

  it("upgrades a version 2 record with none seen, and drops malformed entries", () => {
    const v2 = { ...emptyProgress(0), schemaVersion: 2 } as Record<string, unknown>;
    delete v2.seenReleases;
    const upgraded = parseProgress(v2, 100);
    expect(upgraded.issues).toEqual([]);
    expect(upgraded.progress.seenReleases).toEqual({});

    const damaged = parseProgress(
      { ...emptyProgress(0), seenReleases: { "v0.1.12": 10, "v0.1.13": "soon", nope: 5 } },
      100,
    );
    expect(damaged.progress.seenReleases).toEqual({ "v0.1.12": 10 });
    expect(damaged.issues).toEqual([
      "seenReleases.v0.1.13 was invalid",
      "seenReleases.nope was invalid",
    ]);
  });

  it("is shared with another tab through storage", async () => {
    const storage = createMemoryStorage();
    const first = new ProgressRepository({ storage, catalog: CATALOG });
    const second = new ProgressRepository({ storage, catalog: CATALOG });
    await first.load();
    await second.load();
    await first.apply({ type: "see-release", version: "v0.1.12" });
    // The other tab's next write starts from the stored record, so it cannot drop the release.
    const saved = await second.apply({ type: "command", command: "commit", ok: true });
    expect(saved.seenReleases["v0.1.12"]).toBeDefined();
  });
});

describe("practice completions", () => {
  it("show in recent activity as practice, with no XP", () => {
    const progress = reduce([
      lesson("git-init", "interactive", "git-basics"),
      { type: "complete", content: { kind: "practice", id: "start-a-branch" } },
    ]);
    expect(recentActivity(progress, CATALOG)[0]).toMatchObject({
      kind: "practice",
      id: "start-a-branch",
      title: "Start a Feature Branch",
      xp: 0,
      available: true,
    });
  });

  const practice = (id: string) =>
    ({ type: "complete", content: { kind: "practice", id } }) as const;

  it("are their own namespace and never earn XP", () => {
    const progress = reduce([practice("first-commit"), lesson("first-commit", "interactive")]);
    expect(progress.completedPractice).toEqual({
      "first-commit": { completedAt: T0 + 1000, xp: 0 },
    });
    expect(progress.completedLessons["first-commit"]?.xp).toBe(50);
    expect(progress.xp).toBe(50);
  });

  it("keep the first solve", () => {
    const progress = reduce([practice("start-a-branch"), practice("start-a-branch")]);
    expect(progress.completedPractice["start-a-branch"]?.completedAt).toBe(T0 + 1000);
  });

  it("upgrade from schema 3 as none solved, and never claim XP", () => {
    const v3 = { ...emptyProgress(0), schemaVersion: 3 } as Record<string, unknown>;
    delete v3.completedPractice;
    const upgraded = parseProgress(v3, 0);
    expect(upgraded.issues).toEqual([]);
    expect(upgraded.progress.completedPractice).toEqual({});
    const tampered = parseProgress(
      { ...emptyProgress(0), completedPractice: { x: { completedAt: 5, xp: 999 }, bad: 3 } },
      0,
    );
    expect(tampered.progress.completedPractice).toEqual({ x: { completedAt: 5, xp: 0 } });
    expect(tampered.progress.xp).toBe(0);
    expect(tampered.issues).toContain("completedPractice.bad was invalid");
  });

  it("are cleared by a reset and merged from the account", () => {
    const solved = reduce([practice("start-a-branch")]);
    expect(applyProgressAction(solved, { type: "reset" }, T0).completedPractice).toEqual({});
    const merged = applyProgressAction(
      emptyProgress(T0),
      {
        type: "account-lessons",
        lessons: {},
        practice: { "rescue-a-reset": { completedAt: 7, xp: 0 } },
      },
      T0,
    );
    expect(merged.completedPractice).toEqual({ "rescue-a-reset": { completedAt: 7, xp: 0 } });
  });
});

describe("skills", () => {
  it("normalize equivalent concept labels", () => {
    expect(normalizeConcept(" Merge_Conflicts ")).toBe("merge-conflicts");
    expect(skillForConcept("Remote Tracking Branches")).toBe("remotes");
    expect(skillForConcept("git-add")).toBe("staging");
    expect(skillForConcept("not-a-concept")).toBeNull();
    expect(skillsForConcepts(["commits", "git-init", "staging", "commits"])).toEqual([
      "repositories",
      "staging",
      "commits",
    ]);
  });

  it("are untouched with no progress", () => {
    const skills = skillProgress(emptyProgress(T0), CATALOG);
    expect(skills.map((entry) => entry.skill.id)).toEqual(SKILLS.map((skill) => skill.id));
    expect(skills.every((entry) => entry.status === "untouched")).toBe(true);
    expect(skills.find((entry) => entry.skill.id === "branches")?.available).toBe(2);
  });

  it("count concept lessons as studied and one hands-on item as practiced, never mastered", () => {
    const progress = reduce([
      lesson("what-is-git", "concept", "git-basics"),
      lesson("git-init", "interactive", "git-basics"),
    ]);
    const byId = (id: string) =>
      skillProgress(progress, CATALOG).find((entry) => entry.skill.id === id);
    expect(byId("repositories")).toMatchObject({ status: "practiced", handsOn: 1, read: 1 });
    expect(byId("staging")?.status).toBe("untouched");
  });

  it("need repeated, partly unguided work for mastery", () => {
    const guided = reduce([
      lesson("git-init", "interactive", "git-basics"),
      lesson("first-commit", "interactive"),
    ]);
    const repositories = (p: LocalProgress) =>
      skillProgress(p, CATALOG).find((entry) => entry.skill.id === "repositories");
    expect(repositories(guided)?.status).toBe("practiced");
    const withChallenge = applyProgressAction(
      guided,
      lesson("first-repository-challenge", "challenge", "git-basics"),
      T0 + 9000,
    );
    expect(repositories(withChallenge)).toMatchObject({
      status: "mastered",
      handsOn: 3,
      unguided: 1,
    });
  });

  it("count practice towards its skill, and ignore removed content", () => {
    const progress = reduce([
      { type: "complete", content: { kind: "practice", id: "start-a-branch" } },
      { type: "complete", content: { kind: "practice", id: "removed-task" } },
    ]);
    const branches = skillProgress(progress, CATALOG).find(
      (entry) => entry.skill.id === "branches",
    );
    expect(branches).toMatchObject({ status: "practiced", handsOn: 1, unguided: 1 });
  });

  it("cover every skill id a practice task can name", () => {
    expect(CATALOG.practice.every((task) => isSkillId(task.skill))).toBe(true);
    expect(isSkillId("juggling")).toBe(false);
  });
});

describe("recommendNextSteps", () => {
  const hrefs = (progress: LocalProgress) =>
    recommendNextSteps(progress, CATALOG).map((r) => r.href);

  it("starts at the beginning for a new learner", () => {
    const [first, ...rest] = recommendNextSteps(emptyProgress(T0), CATALOG);
    expect(first).toMatchObject({
      href: "/learn/git-basics/what-is-git",
      reason: "Start at the beginning",
      kind: "lesson",
    });
    expect(rest.map((r) => r.reason)).toEqual([
      "Try your first repository task",
      "Try your first staging task",
    ]);
  });

  it("continues a started course first, then unpracticed skills", () => {
    const progress = reduce([lesson("what-is-git", "concept", "git-basics")]);
    const steps = recommendNextSteps(progress, CATALOG);
    expect(steps[0]).toMatchObject({
      href: "/learn/git-basics/git-init",
      reason: "Continue the course you started",
    });
    expect(steps.map((step) => step.id)).toEqual([...new Set(steps.map((step) => step.id))]);
  });

  it("resumes the last lesson visited when it is unfinished", () => {
    const progress = reduce([
      lesson("what-is-git", "concept", "git-basics"),
      { type: "visit-lesson", courseId: "branching", lessonId: "git-branch" },
    ]);
    expect(recommendNextSteps(progress, CATALOG)[0]).toMatchObject({
      href: "/learn/branching/git-branch",
      reason: "Pick up where you left off",
    });
  });

  it("never recommends completed content, and suggests practice once lessons are done", () => {
    const progress = reduce([
      lesson("what-is-git", "concept", "git-basics"),
      lesson("git-init", "interactive", "git-basics"),
      lesson("first-repository-challenge", "challenge", "git-basics"),
      lesson("git-branch", "interactive", "branching"),
    ]);
    const steps = recommendNextSteps(progress, CATALOG);
    expect(steps.every((step) => step.kind === "practice")).toBe(true);
    expect(steps.map((step) => step.href)).toEqual([
      "/practice/rescue-a-reset",
      "/practice/start-a-branch",
    ]);
    expect(steps[0]?.reason).toBe("Try your first recovery task");
    expect(steps[1]?.reason).toBe("More branching practice, without step-by-step help");
  });

  it("is empty when everything is done, and stable for the same progress", () => {
    const all = reduce([
      lesson("what-is-git", "concept", "git-basics"),
      lesson("git-init", "interactive", "git-basics"),
      lesson("first-repository-challenge", "challenge", "git-basics"),
      lesson("git-branch", "interactive", "branching"),
      { type: "complete", content: { kind: "practice", id: "start-a-branch" } },
      { type: "complete", content: { kind: "practice", id: "rescue-a-reset" } },
    ]);
    expect(recommendNextSteps(all, CATALOG)).toEqual([]);
    const some = reduce([lesson("git-init", "interactive", "git-basics")]);
    expect(hrefs(some)).toEqual(hrefs(structuredClone(some)));
    expect(recommendNextSteps(some, CATALOG, { limit: 1 })).toHaveLength(1);
  });
});

describe("pickSurpriseTask", () => {
  const tasks = ["a", "b", "c", "d"].map((id) => ({ id, missingCommands: [] as string[] }));

  it("is deterministic for a seed and covers the pool as the seed grows", () => {
    expect(pickSurpriseTask(tasks, { solved: {}, seed: 5 })).toEqual(
      pickSurpriseTask(tasks, { solved: {}, seed: 5 }),
    );
    const picked = [0, 1, 2, 3].map((seed) => pickSurpriseTask(tasks, { solved: {}, seed })?.id);
    expect(new Set(picked)).toEqual(new Set(["a", "b", "c", "d"]));
    expect(pickSurpriseTask(tasks, { solved: {}, seed: -3 })).not.toBeNull();
  });

  it("prefers unsolved tasks and never repeats the current or last solved one", () => {
    const solved = { a: { completedAt: 1 }, b: { completedAt: 2 } };
    for (let seed = 0; seed < 10; seed += 1) {
      expect(pickSurpriseTask(tasks, { solved, current: "c", seed })?.id).toBe("d");
    }
    const allSolved = {
      a: { completedAt: 1 },
      b: { completedAt: 4 },
      c: { completedAt: 2 },
      d: { completedAt: 3 },
    };
    for (let seed = 0; seed < 10; seed += 1) {
      expect(pickSurpriseTask(tasks, { solved: allSolved, seed })?.id).not.toBe("b");
    }
  });

  it("falls back to what is left, skips locked tasks, and returns null for nothing", () => {
    const one = [{ id: "a", missingCommands: [] as string[] }];
    expect(
      pickSurpriseTask(one, { solved: { a: { completedAt: 1 } }, current: "a", seed: 3 })?.id,
    ).toBe("a");
    expect(
      pickSurpriseTask([{ id: "x", missingCommands: ["teleport"] }], { solved: {}, seed: 0 }),
    ).toBeNull();
    expect(pickSurpriseTask([], { solved: {}, seed: 0 })).toBeNull();
  });
});

describe("buildProgressReport", () => {
  const AT = Date.UTC(2026, 9, 17);

  it("describes empty progress plainly, with no sections to fill", () => {
    const report = buildProgressReport(emptyProgress(T0), CATALOG, { exportedAt: AT });
    expect(report.learnerName).toBe("GitDojo Learner");
    expect(report.exportedAt).toBe(AT);
    expect(report.summary).toMatch(/^No lessons, challenges or practice tasks are completed yet/);
    expect(report.stats.map((stat) => [stat.label, stat.value])).toEqual([
      ["Total XP", 0],
      ["Lessons completed", 0],
      ["Challenges completed", 0],
      ["Practice tasks solved", 0],
    ]);
    // Courses keep their real totals even with nothing done.
    expect(report.courses).toEqual([
      { title: "Git Basics", completed: 0, total: 3, percent: 0 },
      { title: "Branching", completed: 0, total: 1, percent: 0 },
    ]);
    expect(report.skills).toBeNull();
    expect(report.activity).toEqual([]);
    expect(report.commands).toEqual([]);
  });

  it("uses an optional name, trimmed and capped, and the default for a blank one", () => {
    const at = { exportedAt: AT };
    expect(
      buildProgressReport(emptyProgress(T0), CATALOG, { ...at, learnerName: "  Ada   Lovelace " })
        .learnerName,
    ).toBe("Ada Lovelace");
    expect(
      buildProgressReport(emptyProgress(T0), CATALOG, { ...at, learnerName: "   " }).learnerName,
    ).toBe("GitDojo Learner");
    expect(normalizeLearnerName("x".repeat(200))).toHaveLength(60);
  });

  it("counts courses, skills, activity and commands from real progress only", () => {
    const progress = reduce([
      lesson("what-is-git", "concept", "git-basics"),
      lesson("git-init", "interactive", "git-basics"),
      challenge("lost-commit"),
      { type: "complete", content: { kind: "practice", id: "start-a-branch" } },
      { type: "command", command: "commit", ok: true },
      { type: "command", command: "commit", ok: false },
    ]);
    const report = buildProgressReport(progress, CATALOG, {
      exportedAt: AT,
      origin: "https://gitdojo.example",
    });
    expect(report.summary).toBe(
      "Completed 2 lessons, 1 challenge and 1 practice task. 4 skills practiced hands-on so far.",
    );
    expect(report.stats.find((s) => s.label === "Total XP")?.value).toBe(175);
    expect(report.stats.find((s) => s.label === "Git commands run")).toEqual({
      label: "Git commands run",
      value: 2,
      detail: "1 succeeded",
    });
    expect(report.courses[0]).toEqual({ title: "Git Basics", completed: 2, total: 3, percent: 67 });
    expect(report.skills?.practiced.map((s) => [s.label, s.status])).toEqual([
      // The practice task is tagged with both branches and commits.
      ["Repositories", "practiced"],
      ["Commits", "practiced"],
      ["Branches", "practiced"],
      ["Recovering lost work", "practiced"],
    ]);
    expect(report.skills?.masteryRule).toContain("Mastered: 3 or more");
    expect(report.activity.map((a) => [a.kind, a.reward])).toEqual([
      ["Practice", "No XP"],
      ["Challenge", "+100 XP"],
      ["Lesson", "+50 XP"],
      ["Lesson", "+25 XP"],
    ]);
    expect(report.commands).toEqual([{ command: "commit", uses: 2, successes: 1 }]);
    expect(report.nextSteps[0]?.url).toMatch(/^https:\/\/gitdojo\.example\/(learn|practice)\//);
  });

  it("never carries account, device, hint or sync data", () => {
    const progress: LocalProgress = {
      ...reduce([
        lesson("git-init", "interactive", "git-basics"),
        {
          type: "hint",
          content: { kind: "lesson", id: "git-init" },
          objectiveId: "secret-objective",
          index: 0,
        },
      ]),
      owner: { kind: "account", accountId: "account-ada@example.com" },
      deviceId: "device-1234",
    };
    const text = JSON.stringify(buildProgressReport(progress, CATALOG, { exportedAt: AT }));
    for (const secret of [
      "account-ada",
      "@example.com",
      "device-1234",
      "secret-objective",
      "revealedHints",
    ]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("learningJourney", () => {
  const statuses = (progress: LocalProgress) =>
    learningJourney(progress, COURSES).milestones.map((item) => item.status);

  it("starts a new learner at the first course, the rest upcoming", () => {
    const journey = learningJourney(emptyProgress(T0), COURSES);
    expect(journey).toMatchObject({ completed: 0, total: 4, percent: 0 });
    expect(journey.target?.lesson.id).toBe("what-is-git");
    expect(statuses(emptyProgress(T0))).toEqual(["current", "upcoming"]);
  });

  it("follows continue learning, and keeps a skipped course available", () => {
    const progress = reduce([
      { type: "visit-lesson", courseId: "branching", lessonId: "git-branch" },
      lesson("what-is-git", "concept", "git-basics"),
    ]);
    const journey = learningJourney(progress, COURSES);
    expect(journey.target?.course.id).toBe("branching");
    expect(statuses(progress)).toEqual(["available", "current"]);
    expect(journey).toMatchObject({ completed: 1, total: 4, percent: 25 });
  });

  it("marks finished courses completed and has no target once everything is done", () => {
    const progress = reduce([
      lesson("what-is-git", "concept", "git-basics"),
      lesson("git-init", "interactive", "git-basics"),
      lesson("first-repository-challenge", "challenge", "git-basics"),
      lesson("git-branch", "interactive", "branching"),
    ]);
    const journey = learningJourney(progress, COURSES);
    expect(journey.target).toBeNull();
    expect(journey.percent).toBe(100);
    expect(statuses(progress)).toEqual(["completed", "completed"]);
  });

  it("counts only lessons the courses still contain", () => {
    const progress = reduce([
      lesson("removed-lesson", "concept"),
      lesson("first-commit", "interactive"),
    ]);
    expect(learningJourney(progress, COURSES).completed).toBe(0);
  });
});

describe("dailyActivity", () => {
  const NOW = new Date(2026, 9, 17, 9, 0).getTime();
  const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).getTime();
  const complete = (progress: LocalProgress, action: ProgressAction, when: number) =>
    applyProgressAction(progress, action, when);

  it("counts first completions per local day, oldest first, ending today", () => {
    let progress = emptyProgress(at(1));
    progress = complete(progress, lesson("git-init", "interactive", "git-basics"), at(17, 0));
    progress = complete(progress, challenge("lost-commit"), at(17, 8));
    progress = complete(
      progress,
      { type: "complete", content: { kind: "practice", id: "start-a-branch" } },
      at(15, 23),
    );
    progress = complete(
      progress,
      lesson("what-is-git", "concept", "git-basics"),
      new Date(2026, 8, 17).getTime(),
    ); // Before the range.
    const activity = dailyActivity(progress, { now: NOW });
    expect(activity.days).toHaveLength(30);
    expect(activity.days.at(-1)).toMatchObject({
      date: "2026-10-17",
      lessons: 1,
      challenges: 1,
      total: 2,
    });
    expect(activity.days.at(-3)).toMatchObject({ date: "2026-10-15", practice: 1, total: 1 });
    expect(activity.days[0]?.date).toBe("2026-09-18");
    expect(activity).toMatchObject({ activeDays: 2, total: 3, datedCompletions: 4, undated: 0 });
  });

  it("never counts repeats, and leaves migrated completions out instead of guessing a date", () => {
    let progress = complete(emptyProgress(at(1)), lesson("git-init", "interactive"), at(16));
    progress = complete(progress, lesson("git-init", "interactive"), at(17));
    progress = {
      ...progress,
      completedChallenges: { "lost-commit": { completedAt: at(17), xp: 100, migrated: true } },
    };
    const activity = dailyActivity(progress, { now: NOW });
    expect(activity).toMatchObject({ activeDays: 1, total: 1, datedCompletions: 1, undated: 1 });
    expect(activity.days.at(-2)?.total).toBe(1);
  });

  it("has nothing to show for a new learner", () => {
    expect(dailyActivity(emptyProgress(NOW), { now: NOW, days: 7 })).toMatchObject({
      activeDays: 0,
      total: 0,
      datedCompletions: 0,
    });
  });
});

describe("skillNextActions", () => {
  const actionFor = (progress: LocalProgress, skill: string) =>
    skillNextActions(progress, CATALOG).get(skill);

  it("starts an unpractised skill with its first hands-on lesson", () => {
    expect(actionFor(emptyProgress(T0), "branches")).toEqual({
      kind: "lesson",
      title: "git branch",
      href: "/learn/branching/git-branch",
      reason: "Start hands-on",
    });
    // No lesson teaches recovery hands-on, so its Practice task is next.
    expect(actionFor(emptyProgress(T0), "recovery")?.href).toBe("/practice/rescue-a-reset");
  });

  it("asks a practiced skill for the unguided work mastery needs", () => {
    const progress = reduce([lesson("git-branch", "interactive", "branching")]);
    expect(actionFor(progress, "branches")).toMatchObject({
      kind: "practice",
      href: "/practice/start-a-branch",
      reason: "Solve it without step-by-step help",
    });
    const repositories = reduce([lesson("git-init", "interactive", "git-basics")]);
    expect(actionFor(repositories, "repositories")).toMatchObject({
      kind: "lesson",
      href: "/learn/git-basics/first-repository-challenge",
    });
  });

  it("never suggests completed work, and has nothing left when it is all done", () => {
    const progress = reduce([
      lesson("git-branch", "interactive", "branching"),
      { type: "complete", content: { kind: "practice", id: "start-a-branch" } },
    ]);
    expect(actionFor(progress, "branches")).toBeNull();
    const recovery = reduce([challenge("lost-commit")]);
    expect(actionFor(recovery, "recovery")?.href).toBe("/practice/rescue-a-reset");
  });
});
