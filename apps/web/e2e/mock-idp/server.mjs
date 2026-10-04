// A minimal OpenID Connect provider for end-to-end tests: it stands in for WSO2 Identity
// Platform so the real SDK flow (redirect, code exchange, signed ID token, session cookie,
// userinfo, sign-out) runs without a real tenant or account. Test use only; never deploy.
//
//   node e2e/mock-idp/server.mjs            listens on MOCK_IDP_PORT (default 3199)
//
// Paths mirror an organization's base URL: http://localhost:3199/t/gitdojo/oauth2/...
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_IDP_PORT ?? 3199);
const TENANT = "/t/gitdojo";
const BASE = `http://localhost:${String(PORT)}${TENANT}`;
export const CLIENT_ID = "gitdojo-e2e-client";
export const CLIENT_SECRET = "gitdojo-e2e-secret";

const USER = {
  sub: "c0ffee00-0000-4000-8000-000000000001",
  given_name: "Ada",
  family_name: "Lovelace",
  email: "ada@example.com",
};

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "e2e-key";
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };

const b64url = (input) => Buffer.from(input).toString("base64url");
function signJwt(claims) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: KID }));
  const payload = b64url(JSON.stringify(claims));
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${signature.toString("base64url")}`;
}

const codes = new Map(); // code → { redirectUri, nonce }
const accessTokens = new Set();

function send(response, status, body, headers = {}) {
  response.writeHead(status, { "Cache-Control": "no-store", ...headers });
  response.end(body);
}
const json = (response, status, body) =>
  send(response, status, JSON.stringify(body), { "Content-Type": "application/json" });
const redirect = (response, location) => send(response, 302, "", { Location: location });

async function readForm(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return new URLSearchParams(body);
}

function issueTokens(nonce) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = randomBytes(24).toString("hex");
  accessTokens.add(accessToken);
  return {
    access_token: accessToken,
    refresh_token: randomBytes(24).toString("hex"),
    token_type: "Bearer",
    expires_in: 3600,
    scope: "openid profile email",
    id_token: signJwt({
      iss: `${BASE}/oauth2/token`,
      aud: [CLIENT_ID],
      azp: CLIENT_ID,
      sub: USER.sub,
      iat: now,
      exp: now + 3600,
      ...(nonce ? { nonce } : {}),
      ...USER,
    }),
  };
}

// Encode dynamic values for HTML text and quoted attribute contexts.
const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title></head><body style="font-family:sans-serif;padding:2rem">
<h1>${escapeHtml(title)}</h1>${body}</body></html>`;

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${String(PORT)}`);
  const path = url.pathname.startsWith(TENANT) ? url.pathname.slice(TENANT.length) : url.pathname;

  if (path === "/health") return send(response, 200, "ok");

  if (path === "/oauth2/authorize") {
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const state = url.searchParams.get("state") ?? "";
    if (
      url.searchParams.get("client_id") !== CLIENT_ID ||
      !redirectUri.startsWith("http://localhost:")
    ) {
      return send(response, 400, "invalid client or redirect_uri");
    }
    const code = randomBytes(16).toString("hex");
    codes.set(code, { redirectUri, nonce: url.searchParams.get("nonce") });
    const back = new URL(redirectUri);
    back.searchParams.set("code", code);
    back.searchParams.set("state", state);
    back.searchParams.set("session_state", "mock-session-state");
    const cancel = new URL(redirectUri);
    cancel.searchParams.set("error", "access_denied");
    cancel.searchParams.set("error_description", "User denied the consent");
    cancel.searchParams.set("state", state);
    return send(
      response,
      200,
      page(
        "Mock identity provider",
        `<p>Scopes requested: <code data-testid="scopes">${escapeHtml(url.searchParams.get("scope") ?? "")}</code></p>
         <p><a href="${escapeHtml(back.toString())}">Sign in as Ada Lovelace</a></p>
         <p><a href="${escapeHtml(cancel.toString())}">Cancel</a></p>
         <p>No account? <a href="${escapeHtml(back.toString())}">Register</a></p>`,
      ),
      { "Content-Type": "text/html; charset=utf-8" },
    );
  }

  if (path === "/oauth2/token" && request.method === "POST") {
    const form = await readForm(request);
    if (form.get("client_id") !== CLIENT_ID || form.get("client_secret") !== CLIENT_SECRET) {
      return json(response, 401, { error: "invalid_client" });
    }
    if (form.get("grant_type") === "refresh_token") return json(response, 200, issueTokens());
    const grant = codes.get(form.get("code") ?? "");
    codes.delete(form.get("code") ?? "");
    if (!grant || grant.redirectUri !== form.get("redirect_uri")) {
      return json(response, 400, { error: "invalid_grant" });
    }
    return json(response, 200, issueTokens(grant.nonce));
  }

  if (path === "/oauth2/jwks") return json(response, 200, { keys: [jwk] });

  if (path === "/oauth2/userinfo") {
    const token = (request.headers.authorization ?? "").replace(/^Bearer /, "");
    if (!accessTokens.has(token)) return json(response, 401, { error: "invalid_token" });
    return json(response, 200, USER);
  }

  if (path === "/oauth2/revoke") return send(response, 200, "");

  if (path === "/oidc/logout") {
    const target = url.searchParams.get("post_logout_redirect_uri");
    if (!target?.startsWith("http://localhost:")) return send(response, 400, "invalid redirect");
    return redirect(response, target);
  }

  return send(response, 404, "not found");
});

server.listen(PORT, () => {
  console.log(`[mock-idp] ${BASE}`);
});
