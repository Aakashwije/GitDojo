# Release notes and "What's new"

Every GitDojo release has two audiences. Contributors read the full technical changelog on
GitHub. Learners see a short announcement in the app: the version, its date, an optional
introduction and **1–5 highlights**. Only the `## Highlights for learners` section of the approved
release notes reaches the app; pull requests, contributor names, dependency updates and
deployment details stay on GitHub.

## Writing highlights

When staging passes, the release workflow creates a draft with learner highlights collected from
the merged pull requests and GitHub's generated changelog below them. The pull request template
asks contributors to add a `Learner-facing release note` section with one plain-language bullet,
or write `No learner-facing change.` for internal work. The generator reads that section, removes
duplicates and places the resulting bullets under `## Highlights for learners` automatically.
GitHub's technical changelog is grouped using [`.github/release.yml`](../.github/release.yml).
If all included PRs are marked as internal-only, the draft uses a neutral behind-the-scenes
highlight instead.

Review the generated draft before clicking **Publish release**. You can edit its learner
highlights or technical notes if anything needs clarification. The draft workflow does not
overwrite an existing draft when retried.

```markdown
## Learner-facing release note

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
- **Mark internal work clearly.** If a pull request has no learner-visible effect, write exactly
  `No learner-facing change.` in its release-note section. It won't be copied into the announcement.
- **Keep release groups concise.** GitDojo shows at most five highlights. If a release has more,
  the draft workflow stops before creating the draft and reports that the notes need curating.

The optional introduction is a single sentence (240 characters or fewer) above the bullets. Without
one, the app says "Here's what's new for you in this release."

Formatting: `code` and **bold** are shown; everything else is plain text.

## What is checked

`apps/web/scripts/compose-release-notes.mjs` assembles the learner highlights from merged PRs when
the draft is created. It stops before creating a draft if a merged PR is missing the required
section or the release would exceed five highlights. Add or correct the section in the merged PR
description and rerun the **Release** workflow. Bot-authored dependency PRs are left out of learner
highlights. If every human PR is internal-only, the draft gets a neutral behind-the-scenes message.
The **Publish release** workflow then checks the
final edited draft with `apps/web/scripts/release-highlights.mjs` before any production deployment.
If that check fails, edit the release on GitHub and rerun **Publish release**; the check reads the
current release body from the API.

The publish check rejects a release when:

| Rule                                                            | Why                                     |
| --------------------------------------------------------------- | --------------------------------------- |
| There is a `## Highlights for learners` heading                 | It is the announcement                  |
| It has 1–5 top-level bullets                                    | Enough to be useful, few enough to read |
| Each bullet is 160 characters or fewer; the intro 240           | Concise at a glance and on a phone      |
| No `#123`, `@name`, URL, Markdown link, HTML or dependency bump | Those belong in the GitHub changelog    |
| No nested bullets, duplicates or text after the bullets         | Nothing is silently dropped             |

Comments (`<!-- … -->`) are ignored. The section may be `##` or `###` and anywhere in the notes;
it ends at the next heading.

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
