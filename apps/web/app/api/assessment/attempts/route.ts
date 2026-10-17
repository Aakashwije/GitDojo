import { connection } from "next/server";
import { CAPSTONE_RUBRIC_VERSION } from "@gitdojo/shared-types";
import { getVerifiedIdentity } from "@/lib/auth/identity";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import { createAttempt } from "@/lib/assessment/store";
import { CAPSTONE_CRITERIA } from "@/lib/assessment/rubric";

export const runtime = "nodejs";
const PRIVATE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  await connection();
  if (!isSameOriginRequest(request.headers))
    return Response.json({ error: "cross_origin" }, { status: 403, headers: PRIVATE });
  const auth = await getVerifiedIdentity();
  if (auth.status !== "verified")
    return Response.json({ error: auth.status }, { status: 401, headers: PRIVATE });
  try {
    const attempt = await createAttempt(auth.identity);
    return Response.json(
      {
        id: attempt.id,
        rubricVersion: CAPSTONE_RUBRIC_VERSION,
        criteria: CAPSTONE_CRITERIA,
        marker: `gitdojo-capstone:${attempt.id}:${attempt.nonce}\n`,
      },
      { status: 201, headers: PRIVATE },
    );
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: PRIVATE });
  }
}
