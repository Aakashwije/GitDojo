import { connection } from "next/server";
import { isCredentialId } from "@/lib/certificates/ids";
import { getVerifiedIdentity } from "@/lib/auth/identity";
import { certificatePdf } from "@/lib/certificates/pdf";
import { ownCertificate } from "@/lib/certificates/store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const auth = await getVerifiedIdentity();
  if (auth.status !== "verified") return Response.json({ error: auth.status }, { status: 401 });
  const { id } = await params;
  if (!isCredentialId(id)) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const certificate = await ownCertificate(auth.identity, id);
    if (!certificate || certificate.credentialKind !== "completion")
      return Response.json({ error: "not_found" }, { status: 404 });
    const bytes = await certificatePdf(certificate);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="gitdojo-certificate-${id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
