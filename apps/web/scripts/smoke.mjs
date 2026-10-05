// Smoke tests for a deployed GitDojo: public pages, static assets, health, and the protected
// account endpoints' behavior without a session. Read-only: it never signs in or writes data.
//
//   node scripts/smoke.mjs <base-url> [--expect-accounts] [--expect-database]
//
//   --expect-accounts   sign-in must be configured (staging, production)
//   --expect-database   the database must be reachable and migrated (staging, production)
//
// For deployments behind Vercel Deployment Protection, set VERCEL_AUTOMATION_BYPASS_SECRET; it is
// sent as a header and never printed.

const args = process.argv.slice(2);
const base = args.find((arg) => !arg.startsWith("--"));
const expectAccounts = args.includes("--expect-accounts");
const expectDatabase = args.includes("--expect-database");

if (!base || !/^https?:\/\//.test(base)) {
  console.error("Usage: node scripts/smoke.mjs <base-url> [--expect-accounts] [--expect-database]");
  process.exit(2);
}
const origin = new URL(base).origin;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (bypass) headers.set("x-vercel-protection-bypass", bypass);
  // One retry for a cold start or a brief network error, never for an HTTP status.
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetch(new URL(path, origin), {
        ...init,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }
}

const results = [];
async function check(name, run) {
  try {
    await run();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : "failed" });
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(response) {
  expect(
    (response.headers.get("content-type") ?? "").includes("application/json"),
    `expected JSON, got ${response.headers.get("content-type") ?? "no content type"}`,
  );
  return response.json();
}

let landing = "";

await check("Landing page", async () => {
  const response = await request("/");
  expect(response.status === 200, `status ${String(response.status)}`);
  landing = await response.text();
  expect(landing.includes("GitDojo"), "page does not mention GitDojo");
});

for (const path of [
  "/learn",
  "/learn/git-basics/what-is-git",
  "/challenges",
  "/playground",
  "/dashboard",
]) {
  await check(`Page ${path}`, async () => {
    const response = await request(path);
    expect(response.status === 200, `status ${String(response.status)}`);
  });
}

await check("Next.js static assets", async () => {
  const script = landing.match(/\/_next\/static\/[^"'\s]+\.js/)?.[0];
  expect(script, "no script found on the landing page");
  const response = await request(script);
  expect(response.status === 200, `status ${String(response.status)}`);
  expect((response.headers.get("content-type") ?? "").includes("javascript"), "wrong content type");
});

await check("Monaco editor assets", async () => {
  const response = await request("/monaco/vs/loader.js");
  expect(response.status === 200, `status ${String(response.status)}`);
});

await check("Health", async () => {
  const response = await request("/api/health");
  const body = await json(response);
  expect(response.status === 200, `status ${String(response.status)}, database ${body.database}`);
  if (expectDatabase) expect(body.database === "ok", `database is ${body.database}`);
});

await check("Session endpoint", async () => {
  const response = await request("/api/auth/session");
  expect(response.status === 200, `status ${String(response.status)}`);
  expect(
    (response.headers.get("cache-control") ?? "").includes("no-store"),
    "session responses must not be cached",
  );
  const body = await json(response);
  const wanted = expectAccounts ? ["signed-out"] : ["signed-out", "unconfigured"];
  expect(wanted.includes(body.status), `status is ${body.status}`);
});

await check("Progress API requires a session", async () => {
  const response = await request("/api/progress");
  expect(response.status === 401, `status ${String(response.status)}`);
  expect(
    response.headers.get("cache-control") === "private, no-store",
    "progress responses must be private and uncached",
  );
  expect((await json(response)).error?.code === "unauthenticated", "unexpected error code");
});

await check("Progress API refuses cross-origin writes", async () => {
  const response = await request("/api/progress/lessons", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://smoke-test.invalid" },
    body: JSON.stringify({ lessonId: "git-init" }),
  });
  expect(response.status === 403, `status ${String(response.status)}`);
  expect((await json(response)).error?.code === "cross_origin", "unexpected error code");
});

await check("Sign-in page", async () => {
  const response = await request("/sign-in");
  expect(response.status === 200, `status ${String(response.status)}`);
});

const width = Math.max(...results.map((result) => result.name.length));
for (const result of results) {
  const line = `${result.ok ? "PASS" : "FAIL"}  ${result.name.padEnd(width)}`;
  console.log(result.ok ? line : `${line}  ${result.detail}`);
}
const failed = results.filter((result) => !result.ok).length;
console.log(
  failed === 0
    ? `All ${String(results.length)} checks passed for ${origin}.`
    : `${String(failed)} of ${String(results.length)} checks failed for ${origin}.`,
);
process.exitCode = failed === 0 ? 0 : 1;
