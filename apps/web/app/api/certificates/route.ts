import { connection } from "next/server";
import { getVerifiedIdentity } from "@/lib/auth/identity";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import { AWARDS, awardKeys, criteriaNarrative, isAwardKey } from "@/lib/certificates/awards";
import { issueCertificate, ownCertificates } from "@/lib/certificates/store";
import { prepareCredentialIssuer, verificationUrl } from "@/lib/certificates/credential";

export const runtime = "nodejs";
const PRIVATE = { "Cache-Control": "private, no-store" };

async function limitedJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) {
      await reader.cancel();
      throw new Error("body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

/** `null` when the site origin is not configured: the list still loads, without share links. */
function shareableUrl(id: string): string | null {
  try {
    return verificationUrl(id);
  } catch {
    return null;
  }
}

export async function GET() {
  await connection();
  const auth = await getVerifiedIdentity();
  if (auth.status !== "verified")
    return Response.json({ error: auth.status }, { status: 401, headers: PRIVATE });
  try {
    const certificates = await ownCertificates(auth.identity);
    return Response.json(
      {
        awards: awardKeys.map((key) => ({ key, ...AWARDS[key], criteria: criteriaNarrative(key) })),
        certificates: certificates.map((item) => ({
          id: item.id,
          awardKey: item.awardKey,
          criteriaVersion: item.criteriaVersion,
          recipientName: item.recipientName,
          issuedAt: item.issuedAt,
          revoked: item.revokedAt !== null,
          publicNameConsent: item.publicNameConsent,
          verificationUrl: shareableUrl(item.id),
        })),
      },
      { headers: PRIVATE },
    );
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: PRIVATE });
  }
}

export async function POST(request: Request) {
  await connection();
  if (!isSameOriginRequest(request.headers))
    return Response.json({ error: "cross_origin" }, { status: 403 });
  const auth = await getVerifiedIdentity();
  if (auth.status !== "verified")
    return Response.json({ error: auth.status }, { status: 401, headers: PRIVATE });
  if (Number(request.headers.get("content-length") ?? 0) > 2048) {
    return Response.json({ error: "too_large" }, { status: 413, headers: PRIVATE });
  }
  let body: unknown;
  try {
    body = await limitedJson(request);
  } catch {
    return Response.json({ error: "invalid_json_or_size" }, { status: 400 });
  }
  if (!body || typeof body !== "object")
    return Response.json({ error: "invalid_body" }, { status: 400 });
  const { awardKey, publicNameConsent } = body as Record<string, unknown>;
  if (!isAwardKey(awardKey) || typeof publicNameConsent !== "boolean") {
    return Response.json({ error: "invalid_body" }, { status: 400, headers: PRIVATE });
  }
  const recipientName = auth.identity.name?.trim();
  if (
    !recipientName ||
    recipientName.length < 2 ||
    recipientName.length > 80 ||
    /[^\x20-\x7e\xa0-\xff]/.test(recipientName)
  ) {
    return Response.json(
      {
        error: "profile_name_required",
        message: "Add a printable name to your account profile before issuing a certificate.",
      },
      { status: 422, headers: PRIVATE },
    );
  }
  try {
    await prepareCredentialIssuer();
    const result = await issueCertificate(
      auth.identity,
      awardKey,
      recipientName,
      publicNameConsent,
    );
    if (!result.eligible) {
      return Response.json(
        { error: "not_eligible", missing: result.missing },
        { status: 422, headers: PRIVATE },
      );
    }
    return Response.json({ id: result.certificate.id }, { status: 200, headers: PRIVATE });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: PRIVATE });
  }
}
