# Account progress (PostgreSQL)

Signed-in learners can have lesson completions stored on the server, in PostgreSQL, under their
WSO2 account. This phase adds the database, the server-side account identity and two protected
endpoints. It is **optional**: without `DATABASE_URL`, GitDojo works exactly as before.

**In this phase**

- `users` and `lesson_completions` tables, with versioned migrations and `pnpm db:migrate`.
- `GET /api/progress` and `POST /api/progress/lessons` for the signed-in learner only.

**Not in this phase**

- Nothing in the UI calls these endpoints yet. Anonymous progress stays in the browser
  (IndexedDB, [progress.md](./progress.md)) and is never read, changed, merged or uploaded.
- There's no merging of browser progress into an account, no automatic sync, no offline conflict
  resolution, and no playground data on the server.

> **Learner-reported progress.** `POST /api/progress/lessons` records that the learner _says_
> they completed a lesson. The server checks that the lesson exists and computes its XP, but it
> doesn't replay or validate the exercise, because exercises run in the browser. Don't treat
> account XP as proof of skill until server-side validation exists.

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
   `SELECT, INSERT, UPDATE, DELETE` on `users` and `lesson_completions` (and `CONNECT` and
   `USAGE`).
3. **Set `DATABASE_URL`** as a server-side secret in your hosting platform. It's read at runtime,
   so a build doesn't need it. Never use a `NEXT_PUBLIC_` name. Require TLS in the URL:
   `postgres://user:password@host:5432/gitdojo?sslmode=verify-full` (or `sslmode=require` if your
   provider's certificate chain isn't in Node's trust store).
4. **Migrate before each release** that adds migrations, from CI/CD or a release step with the
   same `DATABASE_URL`: `pnpm db:migrate`. Then start the new version.
5. **Connections.** Each server instance keeps a pool of up to 10 connections. Behind a
   transaction-mode pooler (PgBouncer, or a provider's "pooled" port), add `prepare=false` to the
   URL, because prepared statements don't survive transaction pooling.
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

### Errors

| Status | `code`                   | When                                                                       |
| ------ | ------------------------ | -------------------------------------------------------------------------- |
| 400    | `invalid_json`           | The body isn't JSON                                                        |
| 400    | `invalid_body`           | The body isn't a JSON object                                               |
| 400    | `unexpected_fields`      | Any field other than `lessonId`                                            |
| 400    | `invalid_lesson_id`      | `lessonId` is missing, not a string, or not a lesson-id slug (≤ 100 chars) |
| 401    | `unauthenticated`        | No valid session, or no verifiable subject                                 |
| 403    | `cross_origin`           | `POST` from another origin, or without `Origin`                            |
| 413    | `payload_too_large`      | Body over 1 KB                                                             |
| 415    | `unsupported_media_type` | `Content-Type` isn't `application/json`                                    |
| 422    | `unknown_lesson`         | Valid id, but no such lesson in the content                                |
| 500    | `internal_error`         | Database or other failure. Generic message; nothing was changed            |
| 503    | `identity_unavailable`   | The identity provider couldn't be reached to verify the session            |
| 503    | `progress_unavailable`   | `DATABASE_URL` isn't set                                                   |

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

| Test file                                  | What it covers                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/auth/identity.test.ts`                | The subject comes from userinfo and is namespaced by issuer. No session, rejected tokens, and missing or invalid `sub` (never the email) give 401; provider outages give 503. Every call is verified fresh, and tokens are never logged                                                                                                       |
| `lib/http/same-origin.test.ts`             | Same-origin acceptance, forwarded hosts, look-alike origins, missing `Origin`, `Sec-Fetch-Site`                                                                                                                                                                                                                                               |
| `lib/account-progress/api.test.ts`         | Unauthenticated reads and writes never reach the store. Cross-origin writes are refused before the session is checked. XP comes from the catalog. Repeats are idempotent; client XP, user ids, timestamps and malformed or unknown ids are rejected. Records are per learner and per issuer; failures are generic; responses are never cached |
| `lib/account-progress/postgres.db.test.ts` | The real migration command (apply, re-run, edited-migration refusal), unique, foreign-key and check constraints, cascade, user upserts (including concurrent first access), API round trips, cross-account isolation, and concurrent duplicate and mixed completions (XP awarded once)                                                        |
| `proxy.test.ts`                            | The progress API passes through the SDK middleware for session refresh and isn't redirected                                                                                                                                                                                                                                                   |

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
5. Local progress (the dashboard) is unchanged by all of the above.

## Known limitations

- Progress is learner-reported (see above).
- The UI doesn't use these endpoints yet. Browser progress isn't merged or synced.
- Only lesson completions are stored. Standalone challenges, hints, command statistics and
  playground sessions stay local.
- Every progress request makes one userinfo call to WSO2, which adds latency and depends on the
  provider being reachable (`503` otherwise).
- Deleting a WSO2 user doesn't delete their GitDojo rows. Remove them with
  `DELETE FROM users WHERE issuer = $1 AND subject = $2` (completions cascade).
