# Release notes and "What's new"

Every GitDojo release has two audiences. Contributors read the full technical changelog on
GitHub. Learners see a short announcement in the app: the version, its date, an optional
introduction and **1–5 highlights**. Only the `## Highlights for learners` section of the approved
release notes reaches the app; pull requests, contributor names, dependency updates and
deployment details stay on GitHub.

## Writing highlights

When staging passes, the release workflow creates a draft release with the template from
[`.github/release-highlights-template.md`](../.github/release-highlights-template.md) at the top
and GitHub's generated changelog below it. Before you click **Publish release**, replace the
template's comment with the learner announcement:

```markdown
## Highlights for learners

Getting unstuck is easier in this release.

- Reveal a hint when an objective has you stuck.
- See merge commits more clearly in the Git graph.
- Practise `git restore` in a new lesson on undoing changes.
```

Good highlights:

- **Say what the learner can now do, or will notice.** "Reveal a hint when you're stuck", not
  "Add HintPanel component".
- **One line, one idea, 160 characters or fewer.** If it needs a second sentence, it is two
  highlights or a detail for GitHub.
- **Lead with the most noticeable change.** Learners read the first two; nobody reads the fifth.
- **Plain words.** Name Git commands in backticks (`` `git restore` ``); avoid internal names,
  libraries and acronyms.
- **Leave out what learners won't notice**: refactors, tests, CI, dependency updates, deployment.
  A release with nothing learner-facing still needs one honest highlight, such as "Lessons load
  faster on slow connections" or "Small fixes across lessons and the playground".

The optional introduction is a single sentence (240 characters or fewer) above the bullets. Without
one, the app says "Here's what's new for you in this release."

Formatting: `code` and **bold** are shown; everything else is plain text.

## What is checked

`apps/web/scripts/release-highlights.mjs` reads the section, and the **Publish release** workflow
runs it in its first job, before production is requested. The release stops, with one error per
problem in the run summary, when:

| Rule                                                            | Why                                     |
| --------------------------------------------------------------- | --------------------------------------- |
| There is a `## Highlights for learners` heading                 | It is the announcement                  |
| It has 1–5 top-level bullets                                    | Enough to be useful, few enough to read |
| Each bullet is 160 characters or fewer; the intro 240           | Concise at a glance and on a phone      |
| No `#123`, `@name`, URL, Markdown link, HTML or dependency bump | Those belong in the GitHub changelog    |
| No nested bullets, duplicates or text after the bullets         | Nothing is silently dropped             |

Comments (`<!-- … -->`) are ignored, so the template's guidance can stay. The section may be
`##` or `###` and anywhere in the notes; it ends at the next heading.

**If the check fails:** edit the release on GitHub and re-run the failed **Publish release**
workflow. Both steps read the release from the API, not from the original event, so a re-run uses
the edited notes. Nothing has been deployed at that point.

To check notes locally, save the release as JSON and run the same check:

```bash
gh api repos/Aakashwije/GitDojo/releases/tags/v0.1.12 > /tmp/release.json
TAG=v0.1.12 RELEASE_JSON=/tmp/release.json node apps/web/scripts/write-release-info.mjs --check
```

## In the app

The production job writes `apps/web/lib/release-info.json` (`version`, `publishedAt`, `intro`,
`highlights`) and builds with it. `/whats-new` shows the announcement, and a slim banner at the top
of every page links to it until the learner has seen it.

**Seen** means the learner opened the release's "What's new" page or dismissed its banner with the
close button. Showing the banner does not count, and it never dismisses itself. Seen state is kept
per release version, so the next release gets its own banner. It is stored:

- in the learner's progress record, as `seenReleases` (version → first time seen). That record is
  IndexedDB for anonymous learners and syncs to a signed-in learner's account like hints do, as a
  set ([account-progress.md](./account-progress.md#what-syncs)), so a release dismissed on one
  device stays dismissed on the others;
- and in this browser (`localStorage`, `gitdojo:seen-releases`), so a choice made while signed in
  holds after signing out, the banner can hide without waiting for the account, and a dismissal
  holds even when IndexedDB is unavailable. This copy is never uploaded.

The banner appears only once the learner's progress has loaded, so a release dismissed elsewhere
never flashes up. Other open tabs hide it as soon as one tab dismisses it. A progress reset keeps
seen releases: they are not learning progress.

## Tests

| Test file                                        | What it covers                                                                                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/scripts/release-highlights.test.ts`    | Parsing the section next to a generated changelog, comments ignored, 1–5 bullets, length and learner-facing rules, and the `--check` exit code and annotations                                                         |
| `apps/web/features/releases/releases.test.tsx`   | The page's content and headings; marking seen on open; the banner waiting for progress, its labelled controls, keyboard dismissal and focus, reloads, storage failures, the next release, other tabs and other devices |
| `apps/web/features/progress/device-sync.test.ts` | A dismissal reaching the learner's other devices, offline and retried, the earliest time kept, and nothing uploaded for anonymous learners                                                                             |
| `packages/progress/src/progress.test.ts`         | The `see-release` action, the set merge, upgrading schema 2 records, surviving a reset, and another tab's write keeping it                                                                                             |
| `apps/web/lib/account-progress/*.test.ts`        | Validating `seenReleases` uploads, merging across devices and accounts; in PostgreSQL, concurrent uploads writing one row and the cascade                                                                              |
