# Request rate limits

GitDojo limits bursts of sign-in and sign-up submissions, `/api/auth/session` reads and every
`/api/progress/*` request before authentication or database work begins. Rendering or prefetching
the sign-in and sign-up pages does not consume the submission quota. All refused requests receive
HTTP `429`, `Retry-After`, `Cache-Control: private, no-store` and the same JSON error:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Too many requests. Try again shortly."
  }
}
```

## Keys and shared networks

The proxy gives each browser an opaque, HttpOnly, `SameSite=Lax` cookie. A client bucket combines
that token with the network prefix supplied by the trusted reverse proxy: IPv4 `/24` or IPv6
`/64`. The token is not trusted as an identity and is never used by itself.

A second network bucket has a higher ceiling. This lets legitimate learners on shared school,
office, carrier or home networks use independent client limits while still stopping an abusive
client from bypassing protection by repeatedly deleting its cookie. The limiter uses the final
valid `X-Forwarded-For` address, so a value prepended by a client is not selected. Self-hosted
reverse proxies must overwrite `X-Forwarded-For` or set `X-Real-IP` rather than forwarding an
untrusted header unchanged.

## Configuration

All values are read at runtime. Invalid, zero or excessively large values fall back to defaults.

| Variable                                | Default | Meaning                                     |
| --------------------------------------- | ------: | ------------------------------------------- |
| `GITDOJO_RATE_LIMIT_AUTH_MAX`           |      20 | Sign-in and sign-up submissions per browser |
| `GITDOJO_RATE_LIMIT_SESSION_MAX`        |     120 | Session reads per browser                   |
| `GITDOJO_RATE_LIMIT_PROGRESS_MAX`       |     180 | Progress reads and writes per browser       |
| `GITDOJO_RATE_LIMIT_WINDOW_SECONDS`     |      60 | Fixed-window duration for every bucket      |
| `GITDOJO_RATE_LIMIT_NETWORK_MULTIPLIER` |      25 | Network ceiling as a multiple of client max |

For example, the default authentication limits permit 20 submissions per browser and 500
submissions per network in a minute. Tune from observed production traffic, preserve a generous
network multiplier, and change one environment at a time.

## Deployment scope

The in-process counters stop bursts reaching one GitDojo runtime. Serverless platforms may run
several isolated instances, so deployments that need a strict global quota should also configure
their CDN or platform rate limiter with the same routes. Keep this application-level layer: it
protects each instance and provides the response contract the clients expect.

Tests in `apps/web/lib/http/rate-limit.test.ts` cover requests below and above each limit, window
reset, shared-network behavior, network parsing, unrelated routes and the `429` contract.
