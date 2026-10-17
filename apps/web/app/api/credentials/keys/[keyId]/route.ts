import { connection } from "next/server";
import { publicCredentialKey } from "@/lib/certificates/credential";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ keyId: string }> }) {
  await connection();
  const { keyId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(keyId)) return new Response("Not found", { status: 404 });
  try {
    const key = await publicCredentialKey(keyId);
    return key
      ? Response.json(key, { headers: { "Cache-Control": "public, max-age=3600" } })
      : new Response("Not found", { status: 404 });
  } catch {
    return new Response("Key unavailable", { status: 503 });
  }
}
