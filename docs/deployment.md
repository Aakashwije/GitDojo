# Deployment (Vercel, Neon, WSO2)

How GitDojo is deployed and released, what the repository enforces, and what an operator must
configure in Vercel, Neon, WSO2 and GitHub. Nothing in this guide has been configured by the
repository's changes: dashboard settings, secrets, domains and identity provider applications are
yours to set up.

## Environments

|                 | Preview                                | Staging                                               | Production                                 |
| --------------- | -------------------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| Purpose         | Look at a pull request                 | Final check of `main`, with real sign-in and database | Learners                                   |
| Vercel project  | `gitdojo` (Git integration)            | `gitdojo-staging` (no Git connection)                 | `gitdojo` (production target)              |
| Deployed by     | Vercel, for every branch except `main` | **Release** workflow, after CI passes on `main`       | **Release** workflow, after staging passes |
| Domain          | Generated `*.vercel.app`               | Stable, e.g. `staging.gitdojo.dev`                    | e.g. `gitdojo.dev`                         |
| Accounts (WSO2) | Off: no WSO2 variables                 | Staging WSO2 application                              | Production WSO2 application                |
| Database        | None                                   | Neon branch `staging`                                 | Neon branch `main`                         |

Previews never get sign-in or a database. WSO2 accepts only exact, pre-registered callback URLs,
and preview URLs change with every deployment; wildcard callbacks would let any preview (or any
lookalike host) receive sign-in codes. Without WSO2 variables a preview runs GitDojo's anonymous
mode, which is everything except accounts.

## Release flow

```text
pull request ── CI (checks, unit, PostgreSQL, build, browsers) ──▶ "CI required" ──▶ merge
                └─ Vercel preview (anonymous)

push to main ── CI ──(success, newest main commit only)──▶ Release workflow
    staging:     migrate staging DB ─▶ vercel deploy --prod (staging project) ─▶ smoke test
    production:  [optional approval] ─▶ migrate production DB
                 ─▶ vercel deploy --prod --skip-domain ─▶ smoke test the new deployment
                 ─▶ vercel promote ─▶ smoke test the production domain
```

- **One path to production.** `apps/web/vercel.json` turns off Git-triggered deployments of
  `main`, so pushing to `main` never deploys directly; the **Release** workflow
  (`.github/workflows/release.yml`) deploys with the Vercel CLI. Branch and pull request
  previews still come from the Git integration.
- **Only after CI.** The workflow starts when the `CI` workflow succeeds for a push to `main` in
  this repository (never for pull requests or forks), and skips a commit that is no longer the
  head of `main`, so a late CI run can't roll production back. A manual run (**Actions → Release →
  Run workflow** on `main`) first checks that `CI required` passed for that commit.
- **Built by Vercel, from source.** Each environment builds with its own variables. CI's build
  artifact contains the mock identity provider's public settings and is never deployed.
- **Serialized.** Releases share one concurrency group and are never cancelled midway, so two
  migrations or promotions can't overlap. A newer release waits for the running one.
- **Promotion only after checks.** Production is built without receiving traffic
  (`--skip-domain`), smoke-tested, then promoted.

## Vercel

Create two projects from the same repository: `gitdojo` (connected to Git) and `gitdojo-staging`.
For the staging project, disconnect Git (**Settings → Git → Disconnect**) so only the Release
workflow deploys it; otherwise it would build previews of every branch with staging secrets.

Settings for both projects (**Settings → Build and Deployment**):

| Setting                                                    | Value                                                                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework Preset                                           | Next.js                                                                                                                                            |
| Root Directory                                             | `apps/web`                                                                                                                                         |
| Include files outside the Root Directory in the Build Step | **Enabled**: workspace packages and `content/` are outside `apps/web`                                                                              |
| Install Command                                            | Default (pnpm, detected from `pnpm-lock.yaml`; frozen lockfile in CI)                                                                              |
| Build Command                                              | Override: `pnpm build`. It copies Monaco's assets into `public/monaco` before `next build`; a plain `next build` deploys an editor that can't load |
| Output Directory                                           | Default                                                                                                                                            |
| Node.js Version                                            | 24.x (as `.nvmrc`; CI also tests 22)                                                                                                               |

Set `ENABLE_EXPERIMENTAL_COREPACK=1` (all environments) so Vercel uses the exact pnpm version
pinned in `package.json`.

`next.config.ts` traces server files from the workspace root and includes `content/**/*.yaml` in
the progress API functions, which read lesson data at request time. All pages are prerendered at
build time. `proxy.ts` runs on the Node.js runtime.

**Domains.** Production project: your domain. Staging project: the stable staging domain, as its
production domain. **Deployment Protection**: Standard Protection (the default) protects
generated deployment URLs, including the not-yet-promoted production build the workflow smoke
tests. Create **Protection Bypass for Automation** in both projects and store it as
`VERCEL_AUTOMATION_BYPASS_SECRET` (below).

### Environment variables

Set these in each project under **Settings → Environment Variables**. Mark secrets **Sensitive**.
In the `gitdojo` project, set them for **Production** only, never **Preview**: previews must stay
anonymous. In `gitdojo-staging`, set them for **Production** (its staging domain).

| Variable                              | Read at                                       | Staging                     | Production                           | Notes                                                                                         |
| ------------------------------------- | --------------------------------------------- | --------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_ASGARDEO_BASE_URL`       | Build (inlined into browser code) and runtime | Staging organization URL    | Production organization URL          | Public. Change it → redeploy                                                                  |
| `NEXT_PUBLIC_ASGARDEO_CLIENT_ID`      | Build and runtime                             | Staging application         | Production application               | Public. Change it → redeploy                                                                  |
| `ASGARDEO_CLIENT_SECRET`              | Runtime                                       | Secret                      | Secret                               | Sensitive                                                                                     |
| `ASGARDEO_SECRET`                     | Runtime                                       | Random, ≥ 32 chars          | A different random value, ≥ 32 chars | Sensitive. In production builds, accounts stay off if it's shorter. `openssl rand -base64 32` |
| `DATABASE_URL`                        | Runtime                                       | Neon staging **pooled** URL | Neon production **pooled** URL       | Sensitive                                                                                     |
| `DATABASE_POOL_MAX`                   | Runtime                                       | Optional                    | Optional                             | Connections per function instance, 1–20, default 5                                            |
| `GITDOJO_SELF_REGISTRATION`           | Runtime                                       | Optional                    | Optional                             | `disabled` if self sign-up is off                                                             |
| `ASGARDEO_SESSION_COOKIE_EXPIRY_TIME` | Runtime                                       | Optional                    | Optional                             | Seconds, default 86400                                                                        |
| `ENABLE_EXPERIMENTAL_COREPACK`        | Build                                         | `1`                         | `1`                                  | Pinned pnpm                                                                                   |

Never give a secret a `NEXT_PUBLIC_` name: those are published in the browser bundle. Don't set
`DATABASE_URL_UNPOOLED` in Vercel; only migrations use it, from GitHub.

## Neon

Use one Neon project with a branch per environment:

| Environment       | Database                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Production        | Neon branch `main`                                                                                                         |
| Staging           | Neon branch `staging` (created from `main`; reset it from `main` when you want fresh data)                                 |
| CI                | Disposable PostgreSQL 17 containers in GitHub Actions; never Neon                                                          |
| Local development | Docker or a local PostgreSQL ([account-progress.md](./account-progress.md#local-setup)); a personal Neon branch also works |

For each branch, copy two connection strings (**Connect** dialog):

- **Pooled** (host contains `-pooler`) → Vercel `DATABASE_URL`. Serverless functions open many
  short-lived connections; the pooler absorbs them.
- **Direct** (no `-pooler`) → GitHub environment secret `DATABASE_URL_UNPOOLED`, used only by
  `pnpm db:migrate`.

GitDojo's connection settings (`apps/web/lib/db/connection.mjs`) make Neon's strings work as
copied: TLS with certificate verification (`sslmode=require` becomes `verify-full`), no prepared
statements (required by the pooler), `channel_binding` removed (postgres.js doesn't support it),
a bounded pool and short idle timeout. Remote URLs with `sslmode=disable` are refused.

Recommended: run the app with a role that can only read and write GitDojo's tables, and
migrations with the owner role. In the Neon SQL editor, after the first migration:

```sql
CREATE ROLE gitdojo_app WITH LOGIN PASSWORD '<generate a strong password>';
GRANT CONNECT ON DATABASE neondb TO gitdojo_app;
GRANT USAGE ON SCHEMA public TO gitdojo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, lesson_completions TO gitdojo_app;
GRANT SELECT ON gitdojo_schema_migrations TO gitdojo_app; -- for /api/health
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gitdojo_app;
```

Use `gitdojo_app` in `DATABASE_URL` and the owner role in `DATABASE_URL_UNPOOLED`. A suspended
Neon compute wakes on the first request (usually under a second); the 10-second connect timeout
covers it. Keep Neon's history retention long enough for point-in-time restores.

If you use Neon's Vercel integration, check what it writes: it can add `DATABASE_URL` and
friends to **Preview** and create a database branch per preview. Previews don't use a database,
so scope its variables to Production or set the variables by hand as above.

## WSO2 applications

Create **two** applications (see [authentication.md](./authentication.md#wso2-console-setup)):
`GitDojo Staging` and `GitDojo`. Register exactly these URLs on each application's **Protocol**
tab, and its origin under **Allowed origins**:

| Application | Authorized redirect URLs                                                                         | Allowed origin                  |
| ----------- | ------------------------------------------------------------------------------------------------ | ------------------------------- |
| Staging     | `https://staging.<your-domain>/auth/callback`<br>`https://staging.<your-domain>/auth/signed-out` | `https://staging.<your-domain>` |
| Production  | `https://<your-domain>/auth/callback`<br>`https://<your-domain>/auth/signed-out`                 | `https://<your-domain>`         |

Use HTTPS, no trailing slash, no wildcards, and no `*.vercel.app` URLs. If you also serve
`www.<your-domain>`, redirect it to one canonical host in Vercel rather than registering both.
Keep `localhost` URLs on a separate development application.

## GitHub

**Settings → Environments**, create `staging` and `production`. For both, restrict
**Deployment branches** to `main`. For `production`, add **Required reviewers** if releases
should wait for approval.

| Name                              | Kind     | `staging`                              | `production`                        |
| --------------------------------- | -------- | -------------------------------------- | ----------------------------------- |
| `VERCEL_TOKEN`                    | Secret   | A Vercel token with access to the team | Same or a separate token            |
| `VERCEL_ORG_ID`                   | Secret   | Team id (**Team Settings → General**)  | Team id                             |
| `VERCEL_PROJECT_ID`               | Secret   | `gitdojo-staging` project id           | `gitdojo` project id                |
| `DATABASE_URL_UNPOOLED`           | Secret   | Neon `staging` direct URL (owner role) | Neon `main` direct URL (owner role) |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Secret   | Staging project's bypass secret        | Production project's bypass secret  |
| `STAGING_URL`                     | Variable | `https://staging.<your-domain>`        | –                                   |
| `PRODUCTION_URL`                  | Variable | –                                      | `https://<your-domain>`             |

Secrets are only available to the Release workflow's environment jobs, which run only for
`main`. CI never uses them, so pull requests from forks work without deployment secrets.
Protect `main` with the rulesets in [ci.md](./ci.md#repository-settings).

## First deployment

1. Neon: create the project, the `staging` branch, and (optionally) the app role.
2. WSO2: create the two applications with the URLs above.
3. Vercel: configure both projects, domains, variables and the bypass secrets as above.
4. GitHub: create both environments with their secrets and variables.
5. Merge this configuration to `main`. CI runs; when it passes, **Release** migrates and deploys
   staging, then production. Without step 4, the Release workflow fails and names what's
   missing; production is not deployed.
6. Check staging and production by hand once (checklist below).

The existing production deployment stays live until the first promotion replaces it.

## Smoke tests

`apps/web/scripts/smoke.mjs` runs after each deployment (read-only; it never signs in):

```bash
node apps/web/scripts/smoke.mjs https://staging.<your-domain> --expect-accounts --expect-database
```

| Check                                                                           | Expectation                                         |
| ------------------------------------------------------------------------------- | --------------------------------------------------- |
| `/`, `/learn`, a lesson, `/challenges`, `/playground`, `/dashboard`, `/sign-in` | 200                                                 |
| A `/_next/static/…js` chunk from the landing page                               | 200, JavaScript                                     |
| `/monaco/vs/loader.js`                                                          | 200 (editor assets were copied)                     |
| `/api/health`                                                                   | 200; `database: "ok"` (reachable and migrated)      |
| `/api/auth/session`                                                             | 200, `no-store`, `signed-out` (accounts configured) |
| `GET /api/progress` without a session                                           | 401, `private, no-store`                            |
| `POST /api/progress/lessons` from another origin                                | 403 `cross_origin`                                  |

Manually, after the first release and after changes to accounts or progress, on staging:

- [ ] Sign in; you return to the page you started from.
- [ ] Finish a concept lesson; the dashboard shows its XP.
- [ ] In a private window, sign in again: the same lesson and XP appear.
- [ ] Sign out; the browser's anonymous progress is shown again.
- [ ] `GET /api/health` shows `"database":"ok"`.

## Migrations

`pnpm db:migrate` runs in the Release workflow before each deployment (staging, then
production) and never from the app. Each migration runs in one transaction with its ledger row,
under an advisory lock, and applied files are checksummed. Running it again is a no-op.

The previous version of the app keeps running against the new schema until promotion (and
forever, if you roll back the code), so every migration must be **backward compatible**:

- Add tables, nullable columns, columns with defaults, and indexes.
- Remove or rename things in two releases: first ship code that no longer uses them, then a
  migration that drops them.
- Large indexes: migrations run in transactions, so `CREATE INDEX CONCURRENTLY` isn't available;
  build big indexes manually off-peak before the release.
- With each new migration, update `LATEST_MIGRATION` in `apps/web/lib/db/schema.ts` (a test fails
  otherwise). `/api/health` then reports `outdated` for any deployment whose database lacks it.

## Rollback

- **Code.** Vercel dashboard → `gitdojo` → **Deployments** → the previous production deployment
  → **Instant Rollback**, or `vercel rollback <deployment-url> --token <token>`. Takes seconds,
  no rebuild. Fix forward on `main` afterwards; the next release promotes normally (it promotes
  explicitly, so Vercel's post-rollback hold on automatic domain assignment doesn't block it).
- **Database.** Rolling back code does **not** undo migrations, and the workflow never runs
  "down" migrations. Because migrations are backward compatible, the previous code works with
  the newer schema; leave the schema in place. If a migration itself is wrong, write a new
  migration that corrects it. As a last resort, restore with Neon's point-in-time restore
  (to a new branch first, verify, then switch `DATABASE_URL`); this discards every write since
  that time.
- **Staging failures** stop the release before production is touched. A failed production smoke
  test before promotion leaves the live deployment unchanged; after promotion, roll back as above
  (the job summary says so).

## Common failures

| Symptom                                                     | Cause                                                                             | Fix                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Build: `Cannot find module '@gitdojo/…'` or missing content | Files outside `apps/web` excluded                                                 | Enable **Include files outside the Root Directory**                                |
| Editor never loads; `/monaco/vs/loader.js` 404              | Build Command is `next build`                                                     | Use `pnpm build`                                                                   |
| Sign-in pages say accounts are unavailable                  | A WSO2 variable is missing, or `ASGARDEO_SECRET` is under 32 characters           | Set them; redeploy if a `NEXT_PUBLIC_` value changed                               |
| WSO2 error `callback.not.match`                             | Redirect URL not registered exactly                                               | Register `https://<host>/auth/callback` and `/auth/signed-out`                     |
| `/api/health` 503 `outdated`                                | Migrations not applied to that database                                           | Run the Release workflow (or `pnpm db:migrate` with that database's direct URL)    |
| `/api/health` 503 `unavailable`                             | Wrong `DATABASE_URL`, `sslmode=disable` on a remote host, or the database is down | Check the URL (pooled, TLS); Vercel function logs show the error name and SQLSTATE |
| `prepared statement … does not exist`                       | An older build with prepared statements behind the pooler                         | Deploy current `main` (prepared statements are off)                                |
| Release: "missing: VERCEL_TOKEN …"                          | Environment secrets/variables not set                                             | Add them to the named GitHub environment                                           |
| Release skipped with "no longer the head of main"           | A newer commit was pushed                                                         | Expected; the newer commit is released                                             |
| Smoke test gets 401 from a deployment URL                   | Deployment Protection                                                             | Set `VERCEL_AUTOMATION_BYPASS_SECRET`                                              |
| Pushing to `main` still deploys production directly         | `vercel.json` not picked up                                                       | Root Directory must be `apps/web`; check **Settings → Git** has no override        |
| Previews show sign-in or use a database                     | Variables set for **Preview**                                                     | Remove them from Preview                                                           |

## What the repository can't enforce

Repository files can't change: Vercel project settings, domains, environment variables or
Deployment Protection; GitHub environments, secrets, required reviewers or rulesets; Neon
branches and roles; WSO2 applications. Configure them as above. Merging this configuration
doesn't change any of them.
