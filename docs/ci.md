# Continuous integration

GitDojo uses GitHub Actions with the pnpm version from `package.json`, Node 24 from `.nvmrc`,
and a frozen lockfile. All workflows use read-only repository permissions unless a specific
job needs more. External actions are pinned to full commit hashes; Dependabot proposes updates.
CI needs no deployment or real WSO2/database credentials; releases are a separate workflow
([deployment.md](./deployment.md)).

## Checks

The `CI` workflow runs for pushes to `main`, pull requests, merge queues, manual dispatches and
every Monday at 02:30 UTC (08:00 Asia/Colombo). Other branches are checked through their pull
requests, so a branch push doesn't run everything twice. No path filters omit required checks.

| Job                    | Purpose                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Quality                | Independent formatting, ESLint, TypeScript and actionlint checks                                                   |
| Unit tests             | All package and web tests on Node 22 and 24; JUnit artifacts                                                       |
| PostgreSQL integration | Disposable PostgreSQL 17; migration, isolation and concurrency tests                                               |
| Content validation     | Lesson/challenge schemas, references and executable solutions                                                      |
| Dependency audit       | Reject high/critical advisories in production dependencies                                                         |
| Production build       | Next.js build with mock public identity settings; reusable test artifact                                           |
| Browser                | Desktop Chromium and Pixel 7 against the anonymous server; accessibility checks included                           |
| Accounts               | Mock identity provider sign-in (`auth-flow`) and account progress against PostgreSQL 17 in Chromium and Firefox    |
| Performance            | Node and browser stress scenarios on the weekly schedule or manual request                                         |
| CI required            | Final summary; fails if any job failed, was cancelled or was skipped (performance may be skipped unless requested) |

Checks run concurrently. Browser, account and performance jobs depend on the production build.
The final gate waits for all jobs. Only the optional performance job may be skipped, and only
when it wasn't requested (schedule or the manual `performance` input). Performance scenarios
check correctness under load and enforce generous time budgets, roughly 10–30× a laptop's
timings, so they catch order-of-magnitude regressions without flaking
([testing.md](./testing.md#performance)).

The account job (`Accounts / …`) runs each project on its own runner with a PostgreSQL service
container, migrates it with `pnpm db:migrate`, and points the account-enabled test server at it
through `E2E_DATABASE_URL`. It covers saving and loading account progress in a fresh browser,
duplicate and concurrent completions (XP once), isolation between anonymous progress and
different accounts, sign-out, and a session ended by the identity provider. Each browser project
signs in as different mock users.

The build is created once on Linux/Node 24 with the mock provider's public URL and client ID,
packaged with Monaco assets, and restored by each browser and account job. Playwright is invoked directly so Turborepo cannot silently rebuild it. pnpm,
Next.js compiler output and Playwright downloads (per browser engine) are cached; test results
are always fresh.
Turborepo's task cache is not persisted between workflow runs.

JUnit and Playwright reports/traces are retained for 14 days. The CI build artifact is retained
for 7 days and is a test artifact, not a production deployment package. It contains no `.env`
files. Browser tests use the existing local mock identity provider and test-only credentials.
The SDK inlines its public settings at build time, so the build uses the URL/client ID matching
`playwright.config.ts` (port 3199). The anonymous server still has no runtime auth configuration.
Do not override the browser job's ports without updating the build's mock URL as well.
The database test service uses a disposable database whose name contains `test`; those tests
reset tables and must never target a production database.

`image-types.d.ts` supplies static image types before Next.js generates `next-env.d.ts`.
Do not commit generated Next.js files to make a fresh-checkout lint job pass.

## Security workflows

- `CodeQL` analyzes JavaScript/TypeScript with the extended security query suite on main pushes,
  main pull requests, merge queues, manual runs and a weekly schedule. It uses no build mode and
  uploads findings to GitHub's Security tab. Only that job has `security-events: write`.
- `Dependency review` rejects high/critical vulnerable dependency changes on pull requests,
  including development dependencies. It uses job summaries rather than posting PR comments.
- Dependabot checks npm and GitHub Actions weekly, groups compatible minor/patch updates, and
  leaves major upgrades separate. It does not merge or approve changes automatically.

Enable the repository dependency graph for dependency review. CodeQL is available for public
repositories; private repositories need the appropriate GitHub Code Security entitlement.
If those features are unavailable, configure repository access before requiring their checks.
No workflow uses `pull_request_target` or production secrets when executing contributor code.

Audit failures require examining the advisory and upgrading the affected dependency. The private
`@gitdojo/config` package lists its lint/config tools as development dependencies, so they do not
appear in the production dependency audit. Dependency review still covers development dependency
changes; use `pnpm audit --dev` to inspect existing tooling advisories. No advisories are ignored
through an allowlist. Registry
failures also fail the audit job rather than hiding an incomplete security check. CodeQL analysis
success means scanning completed; configure a repository ruleset to block selected code-scanning
alert severities if alerts should block merges.

## Repository settings

After pushing the workflows and completing a successful run, open **Settings → Rules → Rulesets**
and protect `main`:

1. Require pull requests and the `CI required` status check.
2. Require the branch to be current, or use a merge queue (`merge_group` is supported).
3. Require `Dependency review` for pull requests if dependency review is available.
4. Require CodeQL results/code-scanning thresholds if supported by your repository plan.
5. Block force pushes and branch deletion; choose reviewer requirements appropriate to the team.

Repository settings are not changed by committing these files. Avoid requiring individual matrix
job names: `CI required` remains stable as the CI matrix changes. Dependency review is PR-only;
check how your ruleset applies it before enabling a merge queue requirement.

## Run and troubleshoot

Use **Actions → CI → Run workflow** to rerun all checks. Select the performance input to include
stress tests. The summary on `CI required` identifies failed jobs; open their logs and download
the matching artifact. A failure blocks the gate even when other jobs finish successfully.

New pushes to `main` cancel older `main` runs; new PR updates cancel older runs for that PR.
The Release workflow uses its own concurrency group and is never cancelled midway. Push, PR, manual and scheduled runs use separate concurrency groups, so they cannot cancel
one another. Manual and scheduled runs do not interrupt an in-progress run in their group.
GitHub can still replace a queued pending run. A cancelled run is not evidence of a test failure.

The previous single-job workflow invoked `pnpm test:e2e`, which makes Turbo run its build
dependency again. The browser jobs now restore the build artifact, check its `BUILD_ID`, and
invoke Playwright directly. After changing workflows, push a new commit: rerunning an old run
uses the workflow from its original commit.

Local equivalents:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:content
pnpm audit --prod --audit-level=high
pnpm build
pnpm --filter @gitdojo/web exec playwright test --workers=2
```

Run database tests only with a dedicated `TEST_DATABASE_URL`; see [account-progress.md](./account-progress.md).
For workflow linting, install `github.com/rhysd/actionlint/cmd/actionlint@v1.7.12` with Go, then
run `actionlint` from the repository root. The quality job uses this version too.

Account browser tests need a migrated, dedicated test database:

```bash
DATABASE_URL=postgres://gitdojo:gitdojo@localhost:5432/gitdojo_e2e_test pnpm db:migrate
E2E_DATABASE_URL=postgres://gitdojo:gitdojo@localhost:5432/gitdojo_e2e_test \
  pnpm --filter @gitdojo/web exec playwright test --project=account-chromium --project=account-firefox
```

## Releases

`.github/workflows/release.yml` deploys `main` to staging and then production on Vercel after CI
passes, with migrations, smoke tests and promotion. Vercel builds each release from source with
that environment's variables; the CI build artifact (mock identity provider settings) is never
deployed. Setup and operations: [deployment.md](./deployment.md).
