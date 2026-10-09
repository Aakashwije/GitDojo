# Local progress

GitDojo remembers what a learner has done without an account: completed lessons and challenges,
XP, Git command usage, hints revealed, the last lesson visited and playground sessions. It all
lives in the browser, in IndexedDB, and is shown on the dashboard at `/dashboard`.

```text
Repository state → validators → lesson / challenge completion ─┐
Router result (gitCommand, ok) ───────────────────────────────┤
Hint panel (newly revealed hint) ──────────────────────────────┼→ ProgressAction
Lesson page opened / playground loaded ────────────────────────┘        ↓
                                        @gitdojo/progress  (reducer → IndexedDB, one transaction)
                                                       ↓
                               use-progress-store (Zustand) → dashboard, course outlines, badges
```

## Where the code lives

| Piece                                                  | Responsibility                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `packages/progress`                                    | Model, XP rules, reducer, parsing/repair, migration, IndexedDB storage, selectors    |
| `apps/web/features/progress/state/use-progress-store`  | Reactive mirror for React; queues activity recorded before progress has loaded       |
| `apps/web/features/progress/hooks/use-lesson-progress` | Records lesson visits and completions for a workspace                                |
| `apps/web/features/progress/services/record-command`   | Counts a terminal line from the router's result                                      |
| `apps/web/features/progress/components`                | `ProgressProvider` (loads progress on every page), dashboard, XP award, notices      |
| `apps/web/lib/progress-catalog.ts`                     | The content catalog (ids, titles, types, course order) built from YAML at build time |

The persistence code is framework-free and has no React imports.

## Model

`LocalProgress` (schema version 1), as stored and exported:

| Field                                            | Meaning                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `schemaVersion`                                  | `2`. Bumped when the stored shape changes; older records are upgraded when read            |
| `owner`                                          | `{ kind: "anonymous" }` today; signed-in accounts will get separate records                |
| `deviceId`                                       | Random per browser, so a future sync can merge per-device counters without double counting |
| `completedLessons`                               | Lesson id → `{ completedAt, xp, type, courseId?, migrated? }`                              |
| `completedChallenges`                            | Standalone challenge id → the same record                                                  |
| `xp`                                             | Sum of the records' `xp`; recomputed from them whenever data is read, so it cannot drift   |
| `commandStats`                                   | Git subcommand → `{ uses, successes, lastUsedAt }`, **on this device**                     |
| `revealedHints`                                  | `lesson:<id>` / `challenge:<id>` → hints revealed there, as `<objective id>#<index>`       |
| `lastLesson`                                     | `{ courseId, lessonId, visitedAt }` for the last course lesson opened                      |
| `playgroundSessions`                             | Playground sessions **on this device**                                                     |
| `remoteCounters`                                 | The same two counters from the account's **other** devices, from the last sync             |
| `syncedAt`                                       | When the account last confirmed this device's progress                                     |
| `migrations`                                     | One-off migrations already applied, by name, so none runs twice                            |
| `createdAt`, `updatedAt`, `revision`, `resetAt?` | Bookkeeping: `revision` increases with every saved change                                  |

Compared with the starting model in the roadmap, `completedLessons` and `completedChallenges` are
records keyed by id (with a completion time and the XP awarded) rather than plain id lists, and
`hintsUsed` is derived (`hintsUsed(progress)`) from the set of revealed hints, which is what
makes "count each hint once" enforceable. Content ids are the stable `id` fields from the YAML,
never slugs or titles.

Course completion is **not stored**. `courseProgress(course, completedLessonIds)` derives it from
the course's current lesson list, so adding, removing or reordering lessons never leaves stale
percentages behind.

No credentials of any kind are stored in progress records.

### Counters are per device

`commandStats` and `playgroundSessions` count what happened **in this browser profile**.
Completions, hints and the last lesson can be merged across devices by union or recency, but
counters cannot: adding two devices' command counts is right, adding a device's own counts to
themselves is not. So the server keeps one row per device and `remoteCounters` holds the sum of
the others. `withRemoteCounters(progress)` returns the view a learner should see — the dashboard
uses it, and without an account it changes nothing. See
[account-progress.md](./account-progress.md#what-syncs).

## XP

| Completed content                                      | XP  |
| ------------------------------------------------------ | --- |
| Concept lesson                                         | 25  |
| Interactive (hands-on) lesson                          | 50  |
| Challenge lesson (in a course) or standalone challenge | 100 |

- XP is awarded **once per content item**, on its first completion. "Practice again", replays
  and revisits keep the original record; the completion dialog then says "Already completed: no
  new XP".
- XP follows from the content's `type`; lesson and challenge YAML no longer carry an `xp` field.
- Hints never cost XP.
- A course's challenge lesson (e.g. `first-repository-challenge`) is a **lesson**. Only the
  pages under `/challenges` record **challenges**. Lessons and challenges are separate namespaces
  (the demo lesson and a standalone challenge are both `first-commit`), so the same work is never
  rewarded as both.

## What counts

| Event              | Rule                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lesson attempt     | One set-up of a lesson workspace from its starting state: opening the lesson, or "Practice again" / Reset. Attempts are not counted; completion belongs to the content item, not the attempt.                                                                                                                                   |
| Completion         | All objectives pass according to the validators, evaluated by **this** workspace's own session (stale state from a previous attempt never counts). Concept lessons complete when the learner clicks "Mark as complete".                                                                                                         |
| Command use        | One submitted terminal line that names a supported Git subcommand, counted once, in lessons, challenges and the playground. `successes` counts uses where the command itself succeeded. `help`, `clear`, other programs (`ls`), unsupported Git commands, empty lines, history navigation and terminal redraws are not counted. |
| Hint revealed      | A hint becoming visible for the first time for that content item, identified by objective and position. Re-rendering, reloading or replaying and revealing the same hint again does not count.                                                                                                                                  |
| Lesson visit       | Opening a lesson page that belongs to a course sets `lastLesson`.                                                                                                                                                                                                                                                               |
| Playground session | The playground workspace loading successfully after the playground page is opened. Loading scenarios, resetting, starting a new repository or retrying within that visit do not count again; reopening the page does.                                                                                                           |

## Storage

- **Database**: IndexedDB database `gitdojo-progress`, object store `records`, key `anonymous`.
  It is separate from the LightningFS database (`gitdojo`) holding lesson and playground
  repositories.
- **Atomic updates**: every change is an action (`ProgressAction`) applied by a pure reducer to
  the **latest stored record inside a single readwrite transaction**. Concurrent updates from this
  tab or another one are serialized by IndexedDB, so none are lost and a tab holding stale data
  never overwrites newer progress. Actions queued while a save is running are written together in
  the next transaction.
- **Other tabs**: after each save a `BroadcastChannel` (`gitdojo:progress`) message tells other
  tabs to reload the record, keeping their dashboards and course outlines current.
- **Immediate UI**: the store applies each action locally first, then replaces its state with
  what was saved (which includes other tabs' changes).
- **Activity before load**: anything recorded before progress has loaded is queued and applied
  in order once it has.

## Failures

| Situation                        | Behaviour                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IndexedDB unavailable or blocked | Progress is kept in memory for the visit; a notice says it will not be saved and the dashboard says so too. Learning is unaffected.                                             |
| A save fails (e.g. quota)        | The change stays visible in this tab and a notice says it could not be saved. The next successful save shows exactly what is stored.                                            |
| Malformed stored data            | Read field by field: valid entries are kept, invalid ones dropped, XP recomputed. The repaired record is saved and the original kept next to it (`anonymous:recovered:<time>`). |
| Data from a newer schema version | Left untouched (never downgraded); this tab works in memory and says why.                                                                                                       |

## Migration from earlier versions

Before this package, course progress was a Zustand `persist` entry in localStorage
(`gitdojo:course-progress`: `{ state: { completedLessons: { <id>: true }, completedChallenges }, version }`;
version 1 had no challenges). On the first load:

1. The legacy entry is read (both versions) and its ids are merged into the IndexedDB record.
   Existing records are never overwritten, so nothing is awarded twice.
2. Each migrated completion earns the XP its content type earns today, and is timestamped with the
   migration time (the original time was never saved); the dashboard shows it as "Completed
   earlier". Ids whose content no longer exists are kept with 0 XP.
3. The migration is recorded in `migrations`, so it never runs again, even after a reset.
4. Once the result is safely in IndexedDB, the legacy entry is removed. If IndexedDB is
   unavailable it is left alone, since it is still the only saved copy.

## Export and reset

- **Export** (dashboard → "Export progress") downloads
  `gitdojo-progress-YYYY-MM-DD.json`:
  `{ "format": "gitdojo-progress", "exportVersion": 1, "exportedAt": "…", "progress": { … } }`.
  Import is not implemented.
- **Reset** (dashboard → "Reset learning progress", then confirm in a dialog) clears completions,
  XP, command statistics, hints, the last lesson and the playground session count. It keeps the
  device id and the migration markers, removes any leftover legacy entry, and does **not** touch
  the playground repository, lesson workspaces or playground settings.

## Accounts

Progress is keyed by owner (`ownerKey`): `anonymous`, or `account:<id>` for a signed-in learner.
Signing in creates a separate record rather than replacing the anonymous one, and anonymous
progress is never uploaded or merged into an account.

For a signed-in learner every field in the model above is synced to the account and reaches their
other devices; see [account-progress.md](./account-progress.md). Authentication tokens are never
stored in progress records.

## Known limitations

- A change made in the last moment before a tab closes can be lost if its transaction has not
  committed yet.
- Anonymous progress stays in this browser. It is never uploaded or merged into an account, and
  signed-in learners get a separate per-account record here.
- Completions of content that has since been removed still count towards "Lessons completed"
  and earn whatever XP they earned, but not towards any course's progress.
- Progress is per browser profile; clearing site data removes it. Export is the only backup.
