import "server-only";

import { createPublicKey } from "node:crypto";
import { gzipSync } from "node:zlib";
import { CompactSign, importPKCS8 } from "jose";
import { getDatabase } from "@/lib/db/client";
import { verificationPath } from "./ids";
import { revokedIndexes, type Certificate } from "./store";

const LIST_SIZE = 131072;
const CONTEXT = "https://www.w3.org/ns/credentials/v2";
const BADGE_CONTEXT = "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json";

export function credentialOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) throw new Error("NEXT_PUBLIC_SITE_URL is required for certificates");
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("Certificate site URL must use HTTPS");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Certificate site URL must be an origin");
  }
  return url.origin;
}

/**
 * The exact public verification URL for a certificate, on the configured site origin. The PDF
 * prints it, its QR code encodes it, the badge cites it and the dashboard copies it.
 */
export function verificationUrl(id: string): string {
  return `${credentialOrigin()}${verificationPath(id)}`;
}

function signingConfig(): { keyId: string; pem: string } {
  const keyId = process.env.GITDOJO_CREDENTIAL_KEY_ID?.trim();
  const pem = process.env.GITDOJO_CREDENTIAL_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!keyId || !/^[A-Za-z0-9_-]{1,64}$/.test(keyId) || !pem) {
    throw new Error("Credential signing key is not configured");
  }
  return { keyId, pem };
}

async function signingKey() {
  const { keyId, pem } = signingConfig();
  const jwk = createPublicKey(pem).export({ format: "jwk" });
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) throw new Error("Credential signing key must be RSA");
  const publicJwk = { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", use: "sig", kid: keyId };
  const sql = getDatabase();
  await sql`
    INSERT INTO certificate_signing_keys (key_id, public_jwk)
    VALUES (${keyId}, ${JSON.stringify(publicJwk)}::jsonb)
    ON CONFLICT (key_id) DO NOTHING
  `;
  const [stored] = await sql<{ public_jwk: typeof publicJwk }[]>`
    SELECT public_jwk FROM certificate_signing_keys WHERE key_id = ${keyId}
  `;
  if (
    !stored ||
    stored.public_jwk.n !== publicJwk.n ||
    stored.public_jwk.e !== publicJwk.e ||
    stored.public_jwk.kty !== publicJwk.kty
  ) {
    throw new Error("Credential key ID already belongs to another public key");
  }
  return { keyId, key: await importPKCS8(pem, "RS256") };
}

/** Refuse issuance until the origin and issuer signing key are usable. */
export async function prepareCredentialIssuer(): Promise<void> {
  credentialOrigin();
  await signingKey();
}

export async function publicCredentialKey(keyId: string) {
  const [row] = await getDatabase()<{ public_jwk: object }[]>`
    SELECT public_jwk FROM certificate_signing_keys WHERE key_id = ${keyId}
  `;
  return row?.public_jwk ?? null;
}

async function signedJwt(
  payload: object,
  subject: string,
  id: string,
  issuedAt: Date,
): Promise<string> {
  const origin = credentialOrigin();
  const { keyId, key } = await signingKey();
  const claims = {
    ...payload,
    iss: `${origin}/api/credentials/issuer`,
    sub: subject,
    jti: id,
    nbf: Math.floor(issuedAt.getTime() / 1000),
  };
  return new CompactSign(new TextEncoder().encode(JSON.stringify(claims)))
    .setProtectedHeader({
      alg: "RS256",
      kid: `${origin}/api/credentials/keys/${keyId}`,
      typ: "JWT",
    })
    .sign(key);
}

export function badgePayload(certificate: Certificate) {
  const origin = credentialOrigin();
  const award = certificate.evidence;
  const id = `${origin}/api/credentials/${certificate.id}`;
  const list = Math.floor((certificate.statusIndex - 1) / LIST_SIZE);
  const index = (certificate.statusIndex - 1) % LIST_SIZE;
  const listUrl = `${origin}/api/credentials/status-lists/${list}`;
  return {
    "@context": [CONTEXT, BADGE_CONTEXT],
    id,
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    issuer: {
      id: `${origin}/api/credentials/issuer`,
      type: ["Profile"],
      name: "GitDojo",
      url: origin,
      image: { id: `${origin}/brand/gitdojo-mark.png`, type: "Image" },
    },
    validFrom: certificate.issuedAt.toISOString(),
    name: `${award.title} Completion Certificate`,
    description: award.description,
    credentialSubject: {
      id: `urn:uuid:${certificate.id}`,
      type: ["AchievementSubject"],
      ...(certificate.publicNameConsent ? { name: certificate.recipientName } : {}),
      achievement: {
        id: `${origin}/achievements/${certificate.awardKey}/v${certificate.criteriaVersion}`,
        type: ["Achievement"],
        name: award.title,
        description: award.description,
        criteria: { narrative: award.criteria },
      },
    },
    credentialStatus: {
      id: `${listUrl}#${index}`,
      type: "BitstringStatusListEntry",
      statusPurpose: "revocation",
      statusListIndex: String(index),
      statusListCredential: listUrl,
    },
    evidence: [
      {
        id: verificationUrl(certificate.id),
        type: ["Evidence"],
        name: "GitDojo account completion record",
        description:
          "Server-stored learner-reported completions for the named lessons and practice tasks.",
      },
    ],
  };
}

export async function signedBadge(certificate: Certificate): Promise<string> {
  const payload = badgePayload(certificate);
  return signedJwt(payload, payload.credentialSubject.id, payload.id, certificate.issuedAt);
}

export async function signedStatusList(batch: number): Promise<string> {
  const origin = credentialOrigin();
  const id = `${origin}/api/credentials/status-lists/${batch}`;
  const bytes = Buffer.alloc(LIST_SIZE / 8);
  for (const index of await revokedIndexes(batch)) {
    const offset = Math.floor(index / 8);
    bytes[offset] = (bytes[offset] ?? 0) | (1 << (7 - (index % 8)));
  }
  const now = new Date();
  const subject = `${id}#list`;
  const payload = {
    "@context": [CONTEXT],
    id,
    type: ["VerifiableCredential", "BitstringStatusListCredential"],
    issuer: `${origin}/api/credentials/issuer`,
    validFrom: now.toISOString(),
    credentialSubject: {
      id: subject,
      type: "BitstringStatusList",
      statusPurpose: "revocation",
      encodedList: gzipSync(bytes).toString("base64url"),
      ttl: 60000,
    },
  };
  return signedJwt(payload, subject, id, now);
}
