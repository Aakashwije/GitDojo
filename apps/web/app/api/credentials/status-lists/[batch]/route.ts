import { connection } from "next/server";
import { signedStatusList } from "@/lib/certificates/credential";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ batch: string }> }) {
  await connection();
  const { batch } = await params;
  if (!/^(0|[1-9][0-9]{0,8})$/.test(batch)) return new Response("Not found", { status: 404 });
  try {
    return new Response(await signedStatusList(Number(batch)), {
      headers: { "Content-Type": "application/vc+jwt", "Cache-Control": "public, max-age=60" },
    });
  } catch {
    return new Response("Status unavailable", { status: 503 });
  }
}
