import { connection } from "next/server";
import { signedBadge } from "@/lib/certificates/credential";
import { findCertificate } from "@/lib/certificates/store";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  try {
    const certificate = await findCertificate(id);
    if (!certificate) return new Response("Not found", { status: 404 });
    return new Response(await signedBadge(certificate), {
      headers: {
        "Content-Type": "application/vc+jwt",
        "Content-Disposition": `attachment; filename="gitdojo-badge-${id}.jwt"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Credential unavailable", { status: 503 });
  }
}
