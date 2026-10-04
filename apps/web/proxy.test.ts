// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "./proxy";

// The SDK's proxy helper: records what GitDojo's handler asks of it.
const middleware = vi.hoisted(() => ({
  signedIn: false,
  protectRoute: vi.fn((options?: { redirect?: string }) =>
    Promise.resolve(
      options?.redirect ? Response.redirect(`http://localhost${options.redirect}`) : undefined,
    ),
  ),
}));
vi.mock("@asgardeo/nextjs/middleware", () => ({
  asgardeoMiddleware:
    (
      handler: (
        context: {
          isSignedIn: () => boolean;
          protectRoute: (options?: { redirect?: string }) => Promise<Response | undefined>;
        },
        request: NextRequest,
      ) => Promise<Response | undefined>,
    ) =>
    async (request: NextRequest) =>
      (await handler(
        {
          isSignedIn: () => middleware.signedIn,
          protectRoute: (options) =>
            middleware.signedIn ? Promise.resolve(undefined) : middleware.protectRoute(options),
        },
        request,
      )) ?? new Response(null, { headers: { "x-proxy": "next" } }),
}));

const CONFIGURED = {
  NEXT_PUBLIC_ASGARDEO_BASE_URL: "https://api.asgardeo.io/t/gitdojo",
  NEXT_PUBLIC_ASGARDEO_CLIENT_ID: "client-id",
  ASGARDEO_CLIENT_SECRET: "client-secret",
};

function configure() {
  for (const [name, value] of Object.entries(CONFIGURED)) vi.stubEnv(name, value);
}

beforeEach(() => {
  for (const name of Object.keys(CONFIGURED)) vi.stubEnv(name, "");
  middleware.signedIn = false;
  middleware.protectRoute.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy", () => {
  const request = (path: string) => new NextRequest(`http://localhost${path}`);

  it("does nothing when accounts are not configured", async () => {
    const response = await proxy(request("/account"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(middleware.protectRoute).not.toHaveBeenCalled();
  });

  it("sends signed-out visitors of account pages to sign in, keeping the destination", async () => {
    configure();
    const response = await proxy(request("/account?tab=profile"));
    expect(middleware.protectRoute).toHaveBeenCalledWith({
      redirect: "/sign-in?returnTo=%2Faccount%3Ftab%3Dprofile",
    });
    expect(response.status).toBe(302);
  });

  it("lets signed-in learners and other account routes through", async () => {
    configure();
    middleware.signedIn = true;
    expect((await proxy(request("/account"))).headers.get("x-proxy")).toBe("next");
    middleware.signedIn = false;
    expect((await proxy(request("/sign-in"))).headers.get("x-proxy")).toBe("next");
    expect(middleware.protectRoute).not.toHaveBeenCalled();
  });

  it("refreshes sessions for the progress API without redirecting it", async () => {
    expect(config.matcher).toContain("/api/progress/:path*");
    configure();
    for (const path of ["/api/progress", "/api/progress/lessons"]) {
      expect((await proxy(request(path))).headers.get("x-proxy")).toBe("next");
    }
    // Signed-out API requests reach the route, which answers 401 itself.
    expect(middleware.protectRoute).not.toHaveBeenCalled();
  });
});
