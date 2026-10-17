import { asgardeoMiddleware } from "@asgardeo/nextjs/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { readAuthConfig } from "@/lib/auth/config";
import { withReturnPath } from "@/lib/auth/return-path";
import {
  attachRateLimitCookie,
  rateLimitedResponse,
  SensitiveRequestRateLimiter,
} from "@/lib/http/rate-limit";

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

const requestRateLimiter = new SensitiveRequestRateLimiter();

export async function handleProxy(
  request: NextRequest,
  limiter: Pick<SensitiveRequestRateLimiter, "check"> = requestRateLimiter,
) {
  const limit = limiter.check(request);
  if (limit.retryAfterSeconds !== null) {
    return attachRateLimitCookie(
      rateLimitedResponse(limit.retryAfterSeconds),
      request,
      limit.clientId,
    );
  }

  // Without configuration there is no session to manage; learning is never affected.
  const response = !readAuthConfig().configured
    ? NextResponse.next()
    : await accountSession(request);
  return attachRateLimitCookie(response, request, limit.clientId);
}

export async function proxy(request: NextRequest) {
  return handleProxy(request);
}

export const config = {
  // Account routes only. Learning pages, static files, images and Monaco's assets never pass
  // through authentication. The progress API is here for session refresh only: it answers
  // signed-out requests with 401 itself instead of being redirected.
  matcher: [
    "/sign-in",
    "/sign-up",
    "/account/:path*",
    "/auth/:path*",
    "/api/auth/:path*",
    "/api/progress/:path*",
    "/api/certificates/:path*",
    "/api/credentials/:path*",
  ],
};
