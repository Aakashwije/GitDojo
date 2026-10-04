import { NextResponse } from "next/server";
import { getAccountSession } from "@/lib/auth/session";

/**
 * The learner's account state for the navigation, validated on the server. Pages stay static
 * and fetch this after loading, so learning never waits on (or depends on) the identity provider.
 */
export async function GET() {
  const session = await getAccountSession();
  return NextResponse.json(session, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
