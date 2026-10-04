import { asgardeoMiddleware } from "@asgardeo/nextjs/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { readAuthConfig } from "@/lib/auth/config";
import { withReturnPath } from "@/lib/auth/return-path";

/**
 * Keeps the account session fresh (token refresh, clearing dead sessions) and sends signed-out
 * visitors of account pages to sign in. This is an optimistic check only: account pages and
 * endpoints validate the session again on the server.
 */
const accountSession = asgardeoMiddleware(async (asgardeo, request) => {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/account" || pathname.startsWith("/account/")) {
    return asgardeo.protectRoute({ redirect: withReturnPath("/sign-in", `${pathname}${search}`) });
  }
  return undefined;
});

export async function proxy(request: NextRequest) {
  // Without configuration there is no session to manage; learning is never affected.
  if (!readAuthConfig().configured) return NextResponse.next();
  return accountSession(request);
}

export const config = {
  // Account routes only. Learning pages, static files, images and Monaco's assets never pass
  // through authentication.
  matcher: ["/sign-in", "/sign-up", "/account/:path*", "/auth/:path*", "/api/auth/:path*"],
};
