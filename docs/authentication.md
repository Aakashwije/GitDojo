# Authentication

GitDojo accounts use [WSO2 Identity Platform](https://wso2.com/identity-platform/) through its
official Next.js SDK, [`@asgardeo/nextjs`](https://wso2.com/identity-platform/docs/quick-starts/nextjs/)
(the SDK still uses the Asgardeo name). Accounts are **optional**: every lesson, challenge, the
playground and the local progress dashboard work without one, and without any configuration.

## What is GitDojo's and what is WSO2's

| Screen                                                                     | Served by               | What happens                                                        |
| -------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------- |
| `/sign-in`, `/sign-up`                                                     | GitDojo                 | Explains the action and hands over with one button. No form fields. |
| Sign-in, registration, email verification, password recovery, social login | **WSO2 (hosted pages)** | Credentials are entered here, never on a GitDojo page.              |
| `/auth/callback`                                                           | GitDojo                 | "Finishing sign-in…", then back to the page the learner came from.  |
| `/account`                                                                 | GitDojo                 | Name, email and avatar; sign out.                                   |
| `/auth/sign-out` → WSO2 logout → `/auth/signed-out`                        | GitDojo, then WSO2      | Ends the session everywhere, then "You're signed out".              |

GitDojo stores no passwords. Signing in or out never touches local progress or playground
repositories ([progress.md](./progress.md)). With a PostgreSQL database configured, signed-in
learners also get server-side lesson progress through `/api/progress`
([account-progress.md](./account-progress.md)); the UI does not sync to it yet.

## How it works

```text
Header (every page) ── fetch /api/auth/session ──▶ server: SDK session cookie → OIDC userinfo
                                                   { unconfigured | signed-out | signed-in + profile }

/sign-in ─ "Sign in" ─▶ server action stores the safe return path (httpOnly cookie)
                      ─▶ SDK signIn() ─▶ WSO2 hosted sign-in (or "Register")
WSO2 ─▶ /auth/callback?code&state ─▶ SDK exchanges the code (server) and sets its signed,
                                      httpOnly session cookie ─▶ redirect to the return path
```

- **Static learning pages.** Only the account routes (`app/(account)/`: `/sign-in`, `/sign-up`,
  `/account`, `/auth/*`) render the SDK's `AsgardeoProvider`, and only when configured. All other
  pages stay statically generated; their header asks `/api/auth/session` after loading, so
  learning never waits on, or breaks because of, the identity provider.
- **`proxy.ts`** (Next.js 16) runs the SDK's `asgardeoMiddleware` on account routes,
  `/api/auth/*` and `/api/progress/*` only: it refreshes tokens, clears dead sessions and sends signed-out visitors of
  `/account` to `/sign-in?returnTo=/account`. Static files, images and Monaco's assets never pass
  through it. It is an optimistic check only.
- **Server-side authorization.** `/account` and `/api/auth/session` validate the session on the
  server with the SDK (`asgardeo().getSessionId()` verifies the session cookie's signature and
  expiry). Client components such as the header never decide access.
- **Profile.** Read from the standard OIDC userinfo endpoint (`{baseUrl}/oauth2/userinfo`) with
  the session's access token, cached per session for five minutes. Scopes are `openid profile
email` only; no repository or API permissions are requested.
- **One SDK boundary.** Components use `useAuthClient()` (`features/auth/services/auth-client.ts`),
  a typed wrapper around the SDK's `useAsgardeo()`; server code uses `lib/auth/session.ts`. Both
  are mocked in tests.

### Return paths

`safeReturnPath` (`lib/auth/return-path.ts`) accepts only same-origin relative paths: a single
leading `/`, no `//`, no backslashes, no control characters, at most 512 characters, and never the
sign-in pages themselves (which would loop). Anything else becomes `/learn`. The path is
validated when links are built, again on the server when it is stored in the `gitdojo_return_to`
cookie (httpOnly, `SameSite=Lax`, 30 minutes), and again when the callback reads it.

### States

| State                      | What the learner sees                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not configured             | No account controls in headers; `/sign-in` and `/sign-up` say accounts aren't available, with "Continue learning". `/account` and `/auth/*` redirect safely.                                 |
| Initializing               | Button shows "Preparing…" (disabled); the header reserves space while the session loads.                                                                                                     |
| Redirect in progress       | Button shows "Redirecting…", disabled; a second click does nothing. Using Back resets it.                                                                                                    |
| Successful return          | "Finishing sign-in…", then the page the learner started from, signed in.                                                                                                                     |
| Cancelled on the WSO2 page | `/sign-in` with "Sign-in was cancelled." (`error=access_denied`).                                                                                                                            |
| Failure                    | `/sign-in` with "We couldn't sign you in." Starting fails → "We couldn't reach the sign-in service." If completing hangs for 20 s, a retry link appears. Provider error text is never shown. |
| Expired or revoked session | Shown once: "Your session has ended. Your learning progress is still here. Sign in again."                                                                                                   |
| Signing out                | "Signing you out…", then WSO2's logout, then "You're signed out". Opened directly (not from the menu), the page asks first, so a stray link cannot sign anyone out.                          |
| Registration unavailable   | With `GITDOJO_SELF_REGISTRATION=disabled`, `/sign-up` says registration is closed.                                                                                                           |

## Configuration

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill it in. Never commit real values
(`.env` and `.env.*` are git-ignored, except the example).

| Variable                              | Required      | Purpose                                                                                                                                                                  |
| ------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_ASGARDEO_BASE_URL`       | yes           | `https://api.asgardeo.io/t/<organization>` (https; `http://localhost` is allowed for a local server)                                                                     |
| `NEXT_PUBLIC_ASGARDEO_CLIENT_ID`      | yes           | The application's client ID                                                                                                                                              |
| `ASGARDEO_CLIENT_SECRET`              | yes           | The client secret. Server-side only                                                                                                                                      |
| `ASGARDEO_SECRET`                     | in production | Signs the session cookie (at least 32 characters: `openssl rand -base64 32`). Without it the SDK uses a fixed development key, so production treats auth as unconfigured |
| `GITDOJO_SELF_REGISTRATION`           | no            | `disabled` when self-registration is off in your organization                                                                                                            |
| `ASGARDEO_SESSION_COOKIE_EXPIRY_TIME` | no            | Session cookie lifetime in seconds (SDK default 86400)                                                                                                                   |

Values are read at request time, so a build made without them works once they are set at
runtime. If any required value is missing, GitDojo runs without accounts. Missing variable
**names** (never values) are available to server code through `readAuthConfig()`; tokens and
secrets are never logged.

Do not set `NEXT_PUBLIC_ASGARDEO_SIGN_IN_URL` or `NEXT_PUBLIC_ASGARDEO_SIGN_UP_URL`: they are for
the SDK's embedded forms, which GitDojo does not use.

## WSO2 console setup

These steps are done by whoever operates the GitDojo deployment, in the
[WSO2 Identity Platform console](https://console.asgardeo.io/). None of them have been performed
as part of this repository's changes.

### 1. Create the application

1. Go to **Applications → New Application** and choose the **Next.js** template.
2. Name it (e.g. `GitDojo`) and set the **Authorized redirect URL** to
   `http://localhost:3000/auth/callback` for development.
3. On the application's **Protocol** tab, add every redirect URL GitDojo uses (one per line or
   with **+**):

   | Environment | Sign-in callback                      | After sign-out                          |
   | ----------- | ------------------------------------- | --------------------------------------- |
   | Development | `http://localhost:3000/auth/callback` | `http://localhost:3000/auth/signed-out` |
   | Production  | `https://<your-domain>/auth/callback` | `https://<your-domain>/auth/signed-out` |

   WSO2 rejects redirects to URLs that are not listed, including the post-sign-out redirect. Also
   add your origins under **Allowed origins** if your organization requires it, and keep the
   **Code** and **Refresh Token** grant types enabled.

4. On the **Guide** (or **Info**/**Protocol**) tab, copy the **Client ID**, **Client secret** and
   the organization **base URL** (`https://api.asgardeo.io/t/<organization>`) into
   `apps/web/.env.local`.

### 2. Create a test user

**User Management → Users → Add User**, then sign in with that user on `/sign-in`. Use test
accounts only; GitDojo's automated tests never use real WSO2 accounts.

### 3. Enable self-registration (for "Create account")

**Login & Registration → User Onboarding → Self Registration**, toggle it on. Optionally enable
**account verification** (a confirmation email) and **Activate account immediately**. Newer
organizations use the flow-based registration editor instead; enable registration there.

WSO2 does not document a URL that opens registration directly, so GitDojo's "Create account"
opens the hosted sign-in page, where self-registration adds a **Register** option; the sign-up
page tells learners to choose it. If you keep registration off, set
`GITDOJO_SELF_REGISTRATION=disabled` so `/sign-up` says so instead.

### 4. Brand the hosted pages

**Branding → Styles & Text**, choose **Organization** or the GitDojo **Application**, then set
the logo, favicon, dark theme and colors. Suggested values from GitDojo's design system:
background `#0B0D10`, surface `#151920`, primary `#6C8CFF` (button fill `#4A67E0` keeps white text
at 4.5:1), text `#F4F7FB`, font Inter. Preview, then publish.

### 5. Optional: GitHub sign-in

1. On GitHub, create an OAuth app with **Homepage URL** `https://api.asgardeo.io/t/<organization>`
   and **Authorization callback URL** `https://api.asgardeo.io/t/<organization>/commonauth`.
2. In the console, **Connections → New Connection → GitHub**, with that app's client ID and
   secret. WSO2 requests only the `email` and `public_profile` scopes (no repository access).
3. In GitDojo's application, **Login Flow** tab, add the GitHub connection, and save.

"Sign in with GitHub" then appears on the hosted sign-in page. GitDojo does not show its own
GitHub button, so nothing is advertised that the organization has not configured.

## Manual smoke test

With a configured tenant and a test user (or one you register):

1. Open a lesson anonymously (e.g. `/learn/git-basics/what-is-git`) and mark it complete.
2. Click **Create account** in the header, then **Create account** on `/sign-up`; on the WSO2
   page choose **Register** and create a test account.
3. Complete email verification if your organization requires it.
4. Sign in; you return to the lesson you started from, and the header shows your name.
5. Reload: you are still signed in. `/account` shows your profile.
6. Open the account menu and choose **Sign out**; you pass through WSO2's sign-out and land on
   "You're signed out".
7. The lesson is still marked complete, the dashboard shows the same XP, and the playground
   repository is still there.

Also worth checking: cancel on the WSO2 page (you get "Sign-in was cancelled"), and open
`/account` while signed out (you are asked to sign in and then returned to it).

## Tests

- `lib/auth/*.test.ts`: return-path validation (absolute, protocol-relative, backslash, control
  characters, loops), configuration (missing values, production secret, no secret leakage),
  session reading against a mocked SDK (signed out, signed in, revoked token, failures never log
  tokens).
- `features/auth/*.test.tsx`: the sign-in/sign-up button (one redirect per click, return path
  first, generic errors, Back), sign-out (immediate from the menu, confirmation otherwise, local
  data untouched), header states, the keyboard-operable account menu, the expired-session notice,
  and the server pages (configured, unconfigured, registration closed, callback cancel, failure
  and success, tampered return cookie, `/account` protection).
- `proxy.test.ts`: the proxy is a no-op without configuration and protects `/account`.
- `e2e/auth.spec.ts` (no configuration, as in CI): public routes stay anonymous, account routes
  fall back safely, header states from the session endpoint, keyboard and axe checks, and local
  progress across sign-in and sign-out.
- `e2e/auth-flow.spec.ts`: the real SDK flow against a local mock OpenID Connect provider
  (`e2e/mock-idp/server.mjs`, test-only): sign up from a lesson and return to it, reload, the
  account page, sign out through the provider, cancellation, `/account` protection, a forged
  session cookie, and double clicks. It runs on a second server (`next start` on port 3101) with
  test-only values, in CI too; no secrets are needed.

The mock provider is not WSO2: tenant settings, hosted page behavior, registration, email
verification and branding still need the manual smoke test above.

## Known limitations

- Browser progress is not linked to accounts or synced across devices yet; the server-side
  progress API ([account-progress.md](./account-progress.md)) is not used by the UI yet.
- "Create account" cannot open the registration form directly; learners choose **Register** on
  the hosted page.
- The SDK keeps the access and refresh tokens inside its signed (not encrypted) httpOnly session
  cookie. Scripts cannot read it, but use HTTPS in production (the cookie is `Secure` there).
- Sign-out returns through WSO2's logout endpoint; if WSO2 cannot be reached, the local session is
  still cleared and the learner lands on "You're signed out".
