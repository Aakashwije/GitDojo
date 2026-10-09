# Account progress (PostgreSQL)

Signed-in learners have their whole learning progress stored on the server, in PostgreSQL, under
their WSO2 account, and see it in any browser. It is **optional**: without `DATABASE_URL`,
GitDojo works exactly as before. Deployment (Vercel, Neon, releases): [deployment.md](./deployment.md).

**What exists**

- `users`, `lesson_completions`, `challenge_completions`, `command_stats`, `device_activity`,
  `revealed_hints`, `last_lessons` and `seen_releases` tables, with versioned migrations and `pnpm db:migrate`.
- `GET /api/progress`, `POST /api/progress/lessons`, `POST /api/progress/challenges` and
  `POST /api/progress/sync` for the signed-in learner only.
- In the browser, every field of the progress model ([What syncs](#what-syncs)) is merged with
  the account and reaches the learner's other devices.
- `GET /api/health` reports whether the database is reachable and migrated.

**What doesn't**

- Anonymous browser progress is never merged into, or uploaded to, an account.
- Lesson workspaces and playground repositories stay in the browser: they are not progress.

## What syncs

Everything in the [progress model](./progress.md#model), by these rules. Each one is chosen so
that a retry after a network failure, a reload, two tabs racing or two devices working at once
can never lose an update or count one twice.

| Progress                         | Merge rule                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| Completed lessons and challenges | Unique per content item. The first completion wins and keeps its time and XP; XP is awarded once  |
| Git command usage                | One row per (account, device, command). The account total is the **sum** over devices             |
| Playground sessions              | One count per (account, device); the account total is the sum                                     |
| Revealed hints                   | A **set** per content item: a hint revealed on any device stays recorded on all of them           |
| Last lesson visited              | The **most recent** visit wins; equal times are broken by the higher lesson id, so devices agree  |
| Seen release announcements       | A **set** per release version, keeping the earliest time: dismissed on one device, on all of them |

**Counters are per device, and absolute.** A device uploads its own totals, never a delta, and
the server stores them in that device's row with `GREATEST`, so an upload that arrives late with
stale numbers cannot lower a newer total and the same upload twice changes nothing. A reply tells
the asking device about the **other** devices only; it adds its own
(`withRemoteCounters` in `@gitdojo/progress`). That is why the local record keeps this device's
counters separate from the account's.

**XP is never uploaded.** Only a content id is, and the server computes the XP from the content
catalog. The sync payload carries no XP, no completions and no account id.

> **Learner-reported progress.** `POST /api/progress/lessons` records that the learner _says_
> they completed a lesson. The server checks that the lesson exists and computes its XP, but it
> doesn't replay or validate the exercise, because exercises run in the browser. Don't treat
> account XP as proof of skill until server-side validation exists.

## In the browser

`ProgressProvider` decides whose progress to show once per page load, before anything is read or
written (`features/progress/state/use-progress-store.ts`):

| Situation                                         | Shown                                                      | Writes                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Signed out, or accounts not configured            | Anonymous progress (IndexedDB), exactly as before          | Browser only                                                            |
| Signed in, account loaded                         | The account's progress, cached per account in this browser | Completions on completion; activity ~3 s after the last change          |
| Signed in, account unavailable or too slow (10 s) | This visit only, in memory, with a notice                  | Still sent to the account; never written to anonymous progress          |
| The account rejects the session (401)             | A notice: "Your session has ended", with **Sign in**       | Kept in the account's browser cache, uploaded after signing in again    |
| The account can't be reached (5xx, network)       | A notice: "Account sync paused"                            | Kept in the account's browser cache; retried, and on the `online` event |

- **Isolation.** Anonymous progress and each account have separate IndexedDB records (keyed by
  the account's internal id from `GET /api/progress`). Signing in never uploads anonymous
  progress; signing out shows the anonymous record again; another person signing in on the same
  browser sees only their own account.
- **The account wins for lessons.** Its first completion time and XP replace the cached ones.
  Lessons completed in this browser's account cache but missing from the account (a failed
  upload) are sent again on the next load.
- **Nothing is called synced until the server says so.** `syncedAt` is only written from a
  successful reply. Until then the dashboard says "Saving to your account…", and after a failure
  "Sync paused", with a **Try now** button. Learning never waits for any of it.
- **Counters on a first load.** A page load cannot name its own device in `GET /api/progress`
  (the record has not been read yet), so that reply's counters are ignored and only its hints and
  last lesson are merged. The upload that follows answers with this device excluded, which is
  what the totals are built from. An outage therefore under-reports other devices rather than
  double counting this one.
- **XP once.** Only a lesson's first completion is uploaded; replays send nothing, and the server
  ignores duplicates anyway. Cross-tab updates mark the lesson complete in other open tabs.
- **Dashboard.** Says where progress is saved and whether this device has reached the account;
  account mode hides **Reset** (it would only clear the cache) and keeps **Export**.
- Pages of the sign-in flow (`/sign-in`, `/sign-up`, `/auth/*`) don't load progress: sign-in
  finishes with client-side navigation, and progress is loaded on the next page instead.

## How identity works

```text
browser ── cookie ──▶ proxy.ts (SDK middleware: verifies the session cookie, refreshes tokens)
                    ─▶ route handler
                         1. POST only: same-origin check (Origin / Sec-Fetch-Site)   → 403
                         2. SDK: verified session id → its access token              → 401
                         3. GET {baseUrl}/oauth2/userinfo with that token → `sub`    → 401 / 503
                         4. identity = (issuer, sub) → upsert users row → query by users.id
```

- **The subject comes from the identity provider, never from the browser.** `getVerifiedIdentity`
  (`apps/web/lib/auth/identity.ts`) calls the provider's OIDC userinfo endpoint with the access
  token in the verified session and uses its `sub`. A request body or query parameter can't
  choose the account, and email addresses are never used to identify anyone. The SDK's session
  cookie also carries a `sub`, but the SDK falls back to the session id when the ID token has
  none, so GitDojo doesn't rely on it.
- **Namespaced by issuer.** Users are unique on `(issuer, subject)`. The issuer is the
  organization's OIDC issuer, `{NEXT_PUBLIC_ASGARDEO_BASE_URL}/oauth2/token`, so the same `sub`
  in two organizations means two different users. If you point GitDojo at a different
  organization, its learners get new accounts.
- **Fails closed.** No session, an expired or revoked token, a missing, empty, non-string,
  padded, over-long (more than 255 characters) or control-character `sub`, or no auth
  configuration at all gives `401`. If the provider is unreachable or answers with an error, the
  response is `503`. In every one of these cases the database isn't queried.
- **Not cached.** The subject is fetched on every progress request (one userinfo call each), so a
  revoked session stops working immediately. The header's profile cache in `lib/auth/session.ts`
  is never used for authorization.
- **Tokens stay on the server.** Access and refresh tokens are read from the SDK's httpOnly
  session cookie on the server and are never returned or logged.
- **Session refresh.** `/api/progress/:path*` is in the `proxy.ts` matcher, so the SDK refreshes
  an expiring access token before the route runs. Unlike `/account`, signed-out API requests
  aren't redirected: the route answers `401` itself.
- **Anonymous learning is unchanged.** Learning pages never call these endpoints and never need
  a session or a database.

## Database schema

`apps/web/db/migrations/0001_users_and_lesson_completions.sql`:

| Table                       | Columns                                                                               | Rules                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `users`                     | `id` (uuid), `issuer`, `subject`, `name`, `email`, `created_at`, `updated_at`         | `UNIQUE (issuer, subject)`; `name` and `email` are refreshed from the provider and are for display only  |
| `lesson_completions`        | `user_id` → `users.id`, `lesson_id`, `lesson_type`, `course_id`, `xp`, `completed_at` | `PRIMARY KEY (user_id, lesson_id)`; `ON DELETE CASCADE`; checks on the lesson id format, type and XP ≥ 0 |
| `gitdojo_schema_migrations` | `version`, `checksum`, `applied_at`                                                   | Written by the migration command                                                                         |

`apps/web/db/migrations/0003_device_activity.sql` adds everything besides completions:

| Table             | Columns                                                                | Rules                                                                                                     |
| ----------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `command_stats`   | `user_id`, `device_id`, `command`, `uses`, `successes`, `last_used_at` | `PRIMARY KEY (user_id, device_id, command)`; checks on the command name, `uses >= 0`, `successes <= uses` |
| `device_activity` | `user_id`, `device_id`, `playground_sessions`, `updated_at`            | `PRIMARY KEY (user_id, device_id)`; the count is never negative                                           |
| `revealed_hints`  | `user_id`, `content_key`, `hint`, `revealed_at`                        | `PRIMARY KEY (user_id, content_key, hint)`: the key _is_ the set                                          |
| `last_lessons`    | `user_id`, `course_id`, `lesson_id`, `visited_at`                      | One row per learner; checks on both id formats                                                            |

`apps/web/db/migrations/0004_seen_releases.sql` adds the release announcements a learner has seen
([release-notes.md](./release-notes.md#in-the-app)):

| Table           | Columns                                 | Rules                                                                                 |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| `seen_releases` | `user_id`, `release_version`, `seen_at` | `PRIMARY KEY (user_id, release_version)`; the version must be a tag such as `v0.1.12` |

All five cascade from `users`, so deleting a learner removes their activity too.

- A counter row is upserted with `GREATEST`, so an upload that arrives out of order after a newer
  one leaves the newer totals alone, and the same upload twice changes nothing.
- Hints insert with `ON CONFLICT DO NOTHING`: the set union is the primary key doing its job.
  Seen releases do the same, except that an earlier `seen_at` replaces a later one, so every
  device agrees on when a release was first seen.
- `last_lessons` updates only `WHERE EXCLUDED.visited_at > last_lessons.visited_at`, with the
  higher lesson id breaking a tie, so every device converges on the same answer.
- One transaction per sync request: the device's rows are written and the merged view read
  together, so a concurrent upload from another device is either fully included or not at all.

- The user row is created (upserted) on the first authenticated progress request, and the profile
  is updated when it changes.
- A completion is inserted with `ON CONFLICT (user_id, lesson_id) DO NOTHING`. Retries, repeats and
  concurrent duplicates keep the first row, so `completed_at` and `xp` never change and XP can't
  be awarded twice. Total XP is the sum of the learner's rows.
- Each request runs in one transaction: upsert user, insert, read totals. All queries use
  postgres.js tagged templates, so values are always sent as bind parameters.
- XP follows the browser's rules (`XP_REWARDS` in `@gitdojo/progress`): concept 25,
  interactive 50, challenge 100.

## Local setup

You need PostgreSQL 13 or later (for the built-in `gen_random_uuid()`). Pick one option:

```bash
# Docker
docker run --name gitdojo-postgres -e POSTGRES_USER=gitdojo -e POSTGRES_PASSWORD=gitdojo \
  -e POSTGRES_DB=gitdojo -p 5432:5432 -d postgres:17

# or Homebrew
brew install postgresql@17 && brew services start postgresql@17
createdb gitdojo
```

1. Configure accounts first ([authentication.md](./authentication.md)). Progress needs a signed-in
   learner.
2. Add the connection string to `apps/web/.env.local`, which is git-ignored:

   ```bash
   DATABASE_URL="postgres://gitdojo:gitdojo@localhost:5432/gitdojo"
   ```

3. Apply the migrations:

   ```bash
   pnpm db:migrate
   # Applied 0001_users_and_lesson_completions
   # Applied 1 migration(s).
   ```

   Running it again prints `Database is up to date.` and changes nothing.

4. Start the app with `pnpm dev` and sign in.

### Migrations

- `pnpm db:migrate` (or `pnpm --filter @gitdojo/web db:migrate`) applies every pending
  `apps/web/db/migrations/NNNN_name.sql` in order. It reads `DATABASE_URL` from the environment,
  or else from `apps/web/.env.local` or `.env`, and never prints it.
- Each migration runs in its own transaction together with its row in
  `gitdojo_schema_migrations`, under a PostgreSQL advisory lock. A failed migration is rolled back
  completely, and several instances migrating at the same time apply it once.
- Applied migrations are checksummed. If a file changed after it was applied, the command stops
  with an error. **Never edit an applied migration. Add the next numbered file instead.**

## Production

1. **Provision** a managed PostgreSQL 13+ database, such as Amazon RDS, Cloud SQL, Azure Database
   for PostgreSQL, Neon or Supabase. Enable TLS and backups.
2. **Roles.** Run migrations as a role that owns the schema. Run the app as a role that has only
   `SELECT, INSERT, UPDATE, DELETE` on `users`, `lesson_completions`, `challenge_completions`,
   `command_stats`, `device_activity`, `revealed_hints`, `last_lessons` and `seen_releases` (and
   `CONNECT` and `USAGE`).
3. **Set `DATABASE_URL`** as a server-side secret in your hosting platform. It's read at runtime,
   so a build doesn't need it. Never use a `NEXT_PUBLIC_` name. Require TLS in the URL:
   `postgres://user:password@host:5432/gitdojo?sslmode=verify-full` (or `sslmode=require` if your
   provider's certificate chain isn't in Node's trust store).
4. **Migrate before each release**, never from the app: `pnpm db:migrate` with
   `DATABASE_URL_UNPOOLED` (a direct, non-pooled connection; preferred) or `DATABASE_URL`. The
   release workflow does this ([deployment.md](./deployment.md)).
5. **Connections** (`apps/web/lib/db/connection.mjs`): each server instance keeps a pool of at
   most `DATABASE_POOL_MAX` connections (default 5), closed after 20 idle seconds. Prepared
   statements are always off, so transaction-mode poolers (Neon's `-pooler` host, PgBouncer) work.
   Remote hosts must use TLS: without `sslmode`, certificates are verified (`verify-full`);
   `disable`, `allow` and `prefer` are refused; Neon's `require` is upgraded to `verify-full`.
   `channel_binding` (in Neon's strings) is removed because postgres.js doesn't support it.
   Loopback and single-label hosts (Docker Compose `db`) may connect without TLS.
6. **Accounts** must be configured too, including `ASGARDEO_SECRET`.

## API

Both endpoints:

- answer only for the signed-in learner (session cookie);
- return JSON with `Cache-Control: private, no-store`;
- report errors as `{"error": {"code": "...", "message": "..."}}`.

### `GET /api/progress`

```http
GET /api/progress
Cookie: <the session cookie>
```

```json
200 OK
{
  "account": { "id": "8f6c1c0e-5d3a-4c55-9a8e-1f2b3c4d5e6f" },
  "completedLessons": [
    {
      "lessonId": "git-init",
      "title": "Initialize a Repository",
      "type": "interactive",
      "course": { "id": "git-basics", "slug": "git-basics", "title": "Git Basics" },
      "xp": 50,
      "completedAt": "2026-10-04T10:15:00.000Z"
    }
  ],
  "totalXp": 50
}
```

The title, course and slug come from the current content. `title` and `course` are `null` for a
lesson that was later removed; its XP still counts.

### `POST /api/progress/lessons`

```http
POST /api/progress/lessons
Cookie: <the session cookie>
Origin: https://your-gitdojo-host
Content-Type: application/json

{"lessonId": "git-init"}
```

```json
201 Created          (first completion)
{ "lesson": { "lessonId": "git-init", "xp": 50, "completedAt": "...", ... },
  "alreadyCompleted": false, "totalXp": 50 }

200 OK               (already completed: nothing changed, same completedAt and XP)
{ "lesson": { ... }, "alreadyCompleted": true, "totalXp": 50 }
```

- The body must be exactly `{"lessonId": "<id>"}`, sent as `application/json` and at most 1 KB.
- Any other field, such as `xp`, `userId`, `sub` or `completedAt`, is rejected. XP, type, course,
  ownership and timestamps are always set by the server.
- The id must be a lesson in GitDojo's content catalog: a course lesson or the standalone demo
  lesson. Standalone challenges aren't lessons.
- Cross-site writes are refused. The request must carry an `Origin` matching the host (or
  `X-Forwarded-Host`) and must not be marked `Sec-Fetch-Site: cross-site` or `same-site`. The
  session cookie is also `SameSite=Lax`, and `application/json` requires a CORS preflight, which
  GitDojo never approves.

### `POST /api/progress/sync`

Merges **this device's** activity into the account and answers with the account's merged view.
Completions and XP are not part of it; they have their own endpoints.

```http
POST /api/progress/sync
Cookie: <the session cookie>
Origin: https://your-gitdojo-host
Content-Type: application/json

{
  "schemaVersion": 3,
  "deviceId": "7f3c…",
  "commandStats": { "commit": { "uses": 12, "successes": 11, "lastUsedAt": "2026-10-09T10:00:00.000Z" } },
  "playgroundSessions": 3,
  "revealedHints": { "lesson:git-init": ["initialize#0"] },
  "lastLesson": { "courseId": "git-basics", "lessonId": "git-init", "visitedAt": "2026-10-09T09:58:00.000Z" },
  "seenReleases": { "v0.1.12": "2026-10-09T10:05:00.000Z" }
}
```

```json
200 OK
{
  "account": { "id": "8f6c…" },
  "completedLessons": [ … ],
  "completedChallenges": [ … ],
  "activity": {
    "commandStats": { "commit": { "uses": 4, "successes": 4, "lastUsedAt": "…" } },
    "playgroundSessions": 1,
    "revealedHints": { "lesson:git-init": ["initialize#0", "stage#0"] },
    "lastLesson": { "courseId": "git-basics", "lessonId": "git-add", "visitedAt": "…" },
    "seenReleases": { "v0.1.12": "…" }
  },
  "totalXp": 150
}
```

- Every field but `deviceId` and `schemaVersion` is optional; a device that has only visited a
  lesson sends only that.
- **Counters in the reply exclude the device that asked.** It adds its own, so nothing is counted
  twice. `GET /api/progress?device=<id>` does the same; without the parameter the sums include
  every device.
- **Idempotent.** Counters are absolute, so the same request twice writes the same rows.
- At most **64 KB**; at most 64 commands, 500 content keys and 200 hints each, and 100 seen
  releases (the browser sends its 50 most recent); counts at most 10,000,000; timestamps between
  2020 and 24 hours from now.
- Unknown fields are refused rather than dropped, and a `schemaVersion` this server does not
  know gives `422` so a newer client keeps its progress and retries after the next deploy rather
  than having part of it stored.

### Errors

| Status | `code`                       | When                                                                       |
| ------ | ---------------------------- | -------------------------------------------------------------------------- |
| 400    | `invalid_json`               | The body isn't JSON                                                        |
| 400    | `invalid_body`               | The body isn't a JSON object                                               |
| 400    | `unexpected_fields`          | Any field other than `lessonId`                                            |
| 400    | `invalid_lesson_id`          | `lessonId` is missing, not a string, or not a lesson-id slug (≤ 100 chars) |
| 401    | `unauthenticated`            | No valid session, or no verifiable subject                                 |
| 403    | `cross_origin`               | `POST` from another origin, or without `Origin`                            |
| 413    | `payload_too_large`          | Body over 1 KB                                                             |
| 415    | `unsupported_media_type`     | `Content-Type` isn't `application/json`                                    |
| 400    | `invalid_command_stats`      | A command name, count or timestamp is not valid, or `successes > uses`     |
| 400    | `invalid_device_id`          | `deviceId` is missing or not a short opaque identifier                     |
| 400    | `invalid_hints`              | A content key or hint token is not valid, or there are too many            |
| 400    | `invalid_last_lesson`        | `lastLesson` is not a course id, a lesson id and a visit time              |
| 400    | `invalid_seen_releases`      | `seenReleases` is not release tags with times, or has too many             |
| 422    | `unknown_lesson`             | Valid id, but no such lesson in the content                                |
| 422    | `unsupported_schema_version` | The client's progress schema is newer than this server's; nothing stored   |
| 500    | `internal_error`             | Database or other failure. Generic message; nothing was changed            |
| 503    | `identity_unavailable`       | The identity provider couldn't be reached to verify the session            |
| 503    | `progress_unavailable`       | `DATABASE_URL` isn't set                                                   |

Server logs for failures contain only the error name and PostgreSQL's SQLSTATE code. They never
include the query values, the connection string, tokens or profile data.

## Verification

Automated:

```bash
pnpm --filter @gitdojo/web test        # unit tests; the database suite is skipped
pnpm typecheck && pnpm lint

# Database integration tests against a dedicated, disposable test database. The database name
# must contain "test"; GitDojo's tables there are dropped and re-created on every run.
createdb gitdojo_test   # or: docker exec gitdojo-postgres createdb -U gitdojo gitdojo_test
TEST_DATABASE_URL="postgres://gitdojo:gitdojo@localhost:5432/gitdojo_test" \
  pnpm --filter @gitdojo/web test:db
```

CI runs the database suite against a PostgreSQL 17 service container.

| Test file                                  | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/auth/identity.test.ts`                | The subject comes from userinfo and is namespaced by issuer. No session, rejected tokens, and missing or invalid `sub` (never the email) give 401; provider outages give 503. Every call is verified fresh, and tokens are never logged                                                                                                                                                                                                                                                                |
| `lib/http/same-origin.test.ts`             | Same-origin acceptance, forwarded hosts, look-alike origins, missing `Origin`, `Sec-Fetch-Site`                                                                                                                                                                                                                                                                                                                                                                                                        |
| `lib/account-progress/api.test.ts`         | Unauthenticated reads and writes never reach the store. Cross-origin writes are refused before the session is checked. XP comes from the catalog. Repeats are idempotent; client XP, user ids, timestamps and malformed or unknown ids are rejected. Records are per learner and per issuer; failures are generic; responses are never cached                                                                                                                                                          |
| `lib/account-progress/activity.test.ts`    | Every validation rule for the sync payload (types, ranges, limits, unknown fields, schema versions) and the endpoint's merge behaviour: idempotent retries, sums across devices, a device's own counters excluded, hints as a set, the newest lesson visit with a deterministic tie-break, and account isolation                                                                                                                                                                                       |
| `features/progress/device-sync.test.ts`    | The browser side against a fake account that keeps one row per device: two devices adding up, retries not double counting, hints and the last lesson arriving on the other device, offline recovery, an ended session, a payload the server refuses, and nothing at all for an anonymous learner                                                                                                                                                                                                       |
| `lib/account-progress/postgres.db.test.ts` | The real migration command (apply, re-run, edited-migration refusal), unique, foreign-key and check constraints, cascade, user upserts (including concurrent first access), API round trips, cross-account isolation, and concurrent duplicate and mixed completions (XP awarded once). For activity: per-device sums, `GREATEST` keeping a stale upload from lowering a total, concurrent duplicate uploads writing one row, the hint set, the newest lesson visit, account isolation and the cascade |
| `proxy.test.ts`                            | The progress API passes through the SDK middleware for session refresh and isn't redirected                                                                                                                                                                                                                                                                                                                                                                                                            |

Manual, with a configured tenant and database:

1. Signed out: `curl -i http://localhost:3000/api/progress` returns `401`.
2. Sign in in the browser. In the devtools console on any GitDojo page, run:

   ```js
   await (await fetch("/api/progress")).json();
   // { completedLessons: [], totalXp: 0 }
   await fetch("/api/progress/lessons", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ lessonId: "git-init" }),
   }).then((r) => r.status); // 201, then 200 on repeats
   ```

3. `curl -i -X POST http://localhost:3000/api/progress/lessons -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -H 'Cookie: <copied from devtools>' -d '{"lessonId":"git-init"}'`
   returns `403`.
4. In `psql`, `SELECT issuer, subject, email FROM users;` shows one row with your WSO2 `sub`, and
   `SELECT * FROM lesson_completions;` shows one row per lesson.
5. Open the dashboard in another browser and sign in: the same lessons and XP appear. Sign out:
   the browser's anonymous progress is shown again, unchanged.

## Known limitations

- Progress is learner-reported (see above).
- Anonymous browser progress isn't merged into accounts.
- An account's browser cache stays in IndexedDB after signing out (it is never shown to anyone
  else); clearing site data removes it.
- Lesson workspaces and playground repositories are not progress and stay in the browser.
- Command and playground counters are per device for ever: clearing one browser's site data
  loses that device's share of the totals, because the server cannot tell a cleared device from
  a new one.
- A sync carries the device's whole activity, not a delta, so a learner with a very long history
  sends a few kilobytes on each change. The 64 KB limit is roughly 500 lessons' worth of hints.
- Every progress request makes one userinfo call to WSO2, which adds latency and depends on the
  provider being reachable (`503` otherwise).
- Deleting a WSO2 user doesn't delete their GitDojo rows. Remove them with
  `DELETE FROM users WHERE issuer = $1 AND subject = $2` (completions cascade).

## Migrating an existing deployment

Run `pnpm db:migrate` against each deployment database before deploying this version; it adds
`0003_device_activity`. Nothing has to be backfilled: a device's first sync after the deploy
writes its counters, hints and last lesson, and until then the account simply has none of them.
Browsers upgrade their stored record from schema 1 to 2 on the next load, in place.

## Seen release announcements

Run `pnpm db:migrate` against each deployment database before deploying this version; it adds
`0004_seen_releases` (the release workflows do this). Nothing is backfilled: until a device syncs,
the account simply has no seen releases and the banner shows once more. Browsers upgrade their
stored record from schema 2 to 3 on the next load. A tab still running the previous version then
refuses to overwrite the newer record and says so, rather than dropping the field; reloading it
fixes that. The server accepts schema 1, 2 and 3 uploads, so an old tab's sync still works.

## Standalone challenge sync

`POST /api/progress/challenges` accepts only `{ "challengeId": "first-commit" }`. The server checks the challenge catalog and assigns 100 XP once per account and challenge. `GET /api/progress` returns `completedChallenges` alongside `completedLessons`, with `totalXp` summed across both. Lesson and challenge IDs have separate namespaces.

Run `pnpm db:migrate` against each deployment database before deploying this version. Existing challenge completions in the signed-in account’s browser cache upload automatically on the next visit. Progress in another database or an anonymous browser cache is not imported.
