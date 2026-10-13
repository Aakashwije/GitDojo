# Browser security headers

GitDojo applies its browser security headers to every response in
`apps/web/next.config.ts`. The values live in `apps/web/lib/security-headers.ts` so the Next.js
configuration, unit tests and future changes have one source of truth.

## Protections

- `Content-Security-Policy` limits scripts, styles, connections, frames, workers and other
  resources. Scripts, APIs, fonts and Monaco are self-hosted. Framing, plugins and inline event
  handlers are blocked, and production requests upgrade insecure subresources.
- `X-Content-Type-Options: nosniff` prevents MIME type guessing.
- `Referrer-Policy: strict-origin-when-cross-origin` avoids leaking paths to other sites while
  retaining same-origin diagnostics.
- `Permissions-Policy` disables camera, location, microphone, payment and USB APIs because the
  app does not use them.
- `X-Frame-Options: DENY` backs up CSP's `frame-ancestors 'none'` for older clients.
- `Strict-Transport-Security` asks browsers to keep using HTTPS for the deployed host. Browsers
  ignore it when the local development server is using HTTP.

## Deliberate CSP allowances

The production policy has three narrow compatibility allowances:

- `script-src 'unsafe-inline'` is required by statically rendered Next.js pages and the small
  pre-paint theme script in `app/layout.tsx`. Nonces would force every page to render dynamically,
  losing the CDN-cached static learning pages.
- `style-src 'unsafe-inline'` supports React's inline layout values and Monaco's generated editor
  styles.
- HTTPS images allow the signed-in learner's identity-provider avatar. Monaco's self-hosted web
  workers are allowed from the app origin, with `blob:` retained for worker bootstrap
  compatibility.

`'unsafe-eval'` is added only by `next dev`, where React needs it for debugging. It is absent from
production builds.

## Changing the policy safely

Add the narrowest directive and origin that a feature needs; do not widen `default-src` or add a
wildcard. Keep authentication redirects as top-level navigation rather than allowing the identity
provider in `connect-src` or `frame-src`. Prefer self-hosting new scripts and fonts. If a new
external image source is introduced, keep it under `img-src` only.

Run `pnpm --filter @gitdojo/web test` after a change. `lib/security-headers.test.ts` fails when a
required header or CSP boundary is removed or weakened. The deployed smoke test
(`node apps/web/scripts/smoke.mjs <base-url>`) also checks the actual landing-page response, so a
hosting override or missing configuration is caught during staging and production releases.
