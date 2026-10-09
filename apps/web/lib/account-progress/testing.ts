// Shared fixtures for the account progress tests. Test use only.
import { type ProgressCatalog } from "@gitdojo/progress";
import { type IdentityResult, type VerifiedIdentity } from "@/lib/auth/identity";
import {
  type AccountProgressStore,
  type DeviceActivity,
  type ProgressApiDeps,
  type StoredActivity,
  type StoredCompletion,
} from "./ports";

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

/** One device's rows, exactly as the per-device tables hold them. */
interface DeviceRows {
  commandStats: Map<string, { uses: number; successes: number; lastUsedAt: Date }>;
  playgroundSessions: number;
}

interface UserRows {
  completions: Map<string, StoredCompletion>;
  devices: Map<string, DeviceRows>;
  /** `<content key>\u0000<hint>`, so the set union matches the primary key. */
  hints: Set<string>;
  lastLesson: { courseId: string; lessonId: string; visitedAt: Date } | null;
}

/**
 * An in-memory store with the database's rules: one user per (issuer, subject), one row per
 * completion, one counter row per device, hints as a set, and a single last lesson that only
 * moves forward. The SQL adapter is the real thing; this mirrors its merge semantics so the API
 * tests can exercise them without PostgreSQL.
 */
export function createMemoryProgressStore(): AccountProgressStore & {
  rows: Map<string, UserRows>;
} {
  const rows = new Map<string, UserRows>();
  const userRows = (identity: VerifiedIdentity): UserRows => {
    const key = JSON.stringify([identity.issuer, identity.subject]);
    let user = rows.get(key);
    if (!user) {
      rows.set(
        key,
        (user = { completions: new Map(), devices: new Map(), hints: new Set(), lastLesson: null }),
      );
    }
    return user;
  };

  /** Counters summed over every device but `exclude`, as `readActivity` does. */
  const activityOf = (user: UserRows, exclude: string | undefined): StoredActivity => {
    const totals = new Map<string, { uses: number; successes: number; lastUsedAt: Date }>();
    let playgroundSessions = 0;
    for (const [deviceId, device] of user.devices) {
      if (deviceId === exclude) continue;
      playgroundSessions += device.playgroundSessions;
      for (const [command, stat] of device.commandStats) {
        const total = totals.get(command);
        totals.set(
          command,
          total
            ? {
                uses: total.uses + stat.uses,
                successes: total.successes + stat.successes,
                lastUsedAt: new Date(
                  Math.max(total.lastUsedAt.getTime(), stat.lastUsedAt.getTime()),
                ),
              }
            : { ...stat },
        );
      }
    }
    const revealedHints: Record<string, string[]> = {};
    for (const entry of [...user.hints].sort()) {
      const [contentKey, hint] = entry.split("\u0000");
      if (contentKey && hint) (revealedHints[contentKey] ??= []).push(hint);
    }
    return {
      commandStats: [...totals]
        .map(([command, stat]) => ({ command, ...stat }))
        .sort((a, b) => a.command.localeCompare(b.command)),
      playgroundSessions,
      revealedHints,
      lastLesson: user.lastLesson,
    };
  };

  return {
    rows,
    read(identity, deviceId) {
      const user = userRows(identity);
      return Promise.resolve({
        accountId: `account-${identity.subject}@${identity.issuer}`,
        completions: [...user.completions.values()],
        activity: activityOf(user, deviceId),
      });
    },
    recordCompletion(identity, completion) {
      const user = userRows(identity);
      const key = `${completion.kind ?? "lesson"}:${completion.lessonId}`;
      const existing = user.completions.get(key);
      const stored = existing ?? { ...completion, completedAt: new Date() };
      if (!existing) user.completions.set(key, stored);
      return Promise.resolve({
        created: !existing,
        completion: stored,
        completions: [...user.completions.values()],
      });
    },
    syncActivity(identity, activity: DeviceActivity) {
      const user = userRows(identity);
      let device = user.devices.get(activity.deviceId);
      if (!device) {
        user.devices.set(
          activity.deviceId,
          (device = { commandStats: new Map(), playgroundSessions: 0 }),
        );
      }
      // Counters never go backwards, so an upload that arrives after a newer one is harmless.
      for (const stat of activity.commandStats) {
        const current = device.commandStats.get(stat.command);
        const uses = Math.max(current?.uses ?? 0, stat.uses);
        device.commandStats.set(stat.command, {
          uses,
          successes: Math.min(Math.max(current?.successes ?? 0, stat.successes), uses),
          lastUsedAt: new Date(
            Math.max(current?.lastUsedAt.getTime() ?? 0, stat.lastUsedAt.getTime()),
          ),
        });
      }
      device.playgroundSessions = Math.max(device.playgroundSessions, activity.playgroundSessions);
      for (const [contentKey, hints] of Object.entries(activity.revealedHints)) {
        for (const hint of hints) user.hints.add(`${contentKey}\u0000${hint}`);
      }
      const incoming = activity.lastLesson;
      const current = user.lastLesson;
      if (
        incoming &&
        (!current ||
          incoming.visitedAt.getTime() > current.visitedAt.getTime() ||
          (incoming.visitedAt.getTime() === current.visitedAt.getTime() &&
            incoming.lessonId > current.lessonId))
      ) {
        user.lastLesson = incoming;
      }
      return Promise.resolve({
        accountId: `account-${identity.subject}@${identity.issuer}`,
        completions: [...user.completions.values()],
        activity: activityOf(user, activity.deviceId),
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

/** A `POST /api/progress/sync` request with the given body. */
export function postSync(
  body: unknown,
  {
    origin = "http://localhost:3000",
    headers = {},
  }: { origin?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request("http://localhost:3000/api/progress/sync", {
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

/** A `GET /api/progress` request, optionally naming the asking device. */
export function getRequest(deviceId?: string): Request {
  const url = new URL("http://localhost:3000/api/progress");
  if (deviceId !== undefined) url.searchParams.set("device", deviceId);
  return new Request(url, { headers: { host: "localhost:3000" } });
}
