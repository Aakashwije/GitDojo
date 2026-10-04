import { render, screen, within } from "@testing-library/react";
import { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountPage from "@/app/(account)/account/page";
import CallbackPage from "@/app/(account)/auth/callback/page";
import SignInPage from "@/app/(account)/sign-in/page";
import SignUpPage from "@/app/(account)/sign-up/page";
import { type AccountSession } from "./types";

vi.mock("server-only", () => ({}));
// Static image imports have no dimensions under Vitest; the logo is decorative here anyway.
vi.mock("next/image", () => ({ default: () => null }));

// Boundaries: the server session (SDK), cookies, redirects and the browser SDK hook.
const session = vi.hoisted((): { current: AccountSession } => ({
  current: { status: "signed-out" },
}));
vi.mock("@/lib/auth/session", () => ({
  getAccountSession: () => Promise.resolve(session.current),
}));
const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = cookieJar.get(name);
        return value === undefined ? undefined : { name, value };
      },
    }),
}));
class Redirect extends Error {
  constructor(readonly location: string) {
    super(`redirect to ${location}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Redirect(location);
  },
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("./services/auth-client", () => ({
  useAuthClient: () => ({ signIn: vi.fn(), signOut: vi.fn(), isLoading: false }),
  browserNavigation: { assign: vi.fn() },
}));
vi.mock("./actions", () => ({ rememberReturnPath: vi.fn() }));

const CONFIGURED = {
  NEXT_PUBLIC_ASGARDEO_BASE_URL: "https://api.asgardeo.io/t/gitdojo",
  NEXT_PUBLIC_ASGARDEO_CLIENT_ID: "client-id",
  ASGARDEO_CLIENT_SECRET: "client-secret",
};

function configure(extra: Record<string, string> = {}) {
  for (const [name, value] of Object.entries({ ...CONFIGURED, ...extra })) vi.stubEnv(name, value);
}

const params = (values: Record<string, string> = {}) => ({ searchParams: Promise.resolve(values) });

async function redirectOf(page: Promise<ReactElement>): Promise<string> {
  try {
    await page;
  } catch (error) {
    if (error instanceof Redirect) return error.location;
    throw error;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  // The site header's account control asks the session endpoint; nothing is configured here.
  vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ status: "unconfigured" })));
  vi.unstubAllEnvs();
  for (const name of Object.keys(CONFIGURED)) vi.stubEnv(name, "");
  session.current = { status: "signed-out" };
  cookieJar.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("/sign-in", () => {
  it("keeps learning available when accounts are not configured", async () => {
    render(await SignInPage(params({ returnTo: "/learn/merging" })));
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByTestId("auth-unavailable")).toHaveTextContent(
      "Accounts aren't available on this site yet",
    );
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(screen.getByRole("link", { name: "Continue learning" })).toHaveAttribute(
      "href",
      "/learn/merging",
    );
  });

  it("offers hosted sign-in with links to sign up or keep learning", async () => {
    configure();
    render(await SignInPage(params({ returnTo: "/challenges/lost-commit" })));
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.getByText(/secure sign-in page/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/sign-up?returnTo=%2Fchallenges%2Flost-commit",
    );
    expect(
      screen.getByRole("link", { name: "Continue learning without an account" }),
    ).toHaveAttribute("href", "/challenges/lost-commit");
    // Benefits are honest: no promise of synced progress.
    expect(document.body).not.toHaveTextContent(/sync/i);
  });

  it("never sends the learner to an external return URL", async () => {
    configure();
    render(await SignInPage(params({ returnTo: "https://evil.example" })));
    expect(
      screen.getByRole("link", { name: "Continue learning without an account" }),
    ).toHaveAttribute("href", "/learn");
  });

  it("explains a cancelled or failed sign-in", async () => {
    configure();
    render(await SignInPage(params({ status: "cancelled" })));
    expect(screen.getByTestId("auth-notice")).toHaveTextContent("Sign-in was cancelled");
  });

  it("sends a signed-in learner straight on", async () => {
    configure();
    session.current = { status: "signed-in", user: { name: "Ada", email: null, picture: null } };
    expect(await redirectOf(SignInPage(params({ returnTo: "/dashboard" })))).toBe("/dashboard");
  });
});

describe("/sign-up", () => {
  it("starts the hosted registration flow", async () => {
    configure();
    render(await SignUpPage(params()));
    const card = screen.getByTestId("sign-up");
    expect(
      within(card).getByRole("heading", { name: "Start your Git journey" }),
    ).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Create account" })).toBeEnabled();
    expect(card).toHaveTextContent("choose Register");
    expect(
      within(card).getByRole("link", { name: "Already have an account? Sign in" }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: "Continue without an account" }),
    ).toBeInTheDocument();
  });

  it("says when registration is closed", async () => {
    configure({ GITDOJO_SELF_REGISTRATION: "disabled" });
    render(await SignUpPage(params()));
    expect(screen.getByTestId("registration-closed")).toHaveTextContent("Registration is closed");
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });
});

describe("/auth/callback", () => {
  it("treats a cancelled sign-in as cancelled, keeping the destination", async () => {
    configure();
    cookieJar.set("gitdojo_return_to", "/learn/merging");
    expect(await redirectOf(CallbackPage(params({ error: "access_denied", state: "x" })))).toBe(
      "/sign-in?status=cancelled&returnTo=%2Flearn%2Fmerging",
    );
  });

  it("reports other provider errors generically", async () => {
    configure();
    expect(
      await redirectOf(CallbackPage(params({ error: "server_error", error_description: "boom" }))),
    ).toBe("/sign-in?status=failed&returnTo=%2Flearn");
  });

  it("shows progress while the sign-in completes", async () => {
    configure();
    render(await CallbackPage(params({ code: "abc", state: "xyz" })));
    expect(screen.getByTestId("callback-progress")).toHaveTextContent("Finishing sign-in");
  });

  it("returns to the remembered page once signed in", async () => {
    configure();
    cookieJar.set("gitdojo_return_to", "/challenges/lost-commit");
    session.current = { status: "signed-in", user: { name: "Ada", email: null, picture: null } };
    expect(await redirectOf(CallbackPage(params()))).toBe("/challenges/lost-commit");
  });

  it("ignores a tampered return cookie", async () => {
    configure();
    cookieJar.set("gitdojo_return_to", "//evil.example");
    session.current = { status: "signed-in", user: { name: "Ada", email: null, picture: null } };
    expect(await redirectOf(CallbackPage(params()))).toBe("/learn");
  });
});

describe("/account", () => {
  it("requires a server-validated session", async () => {
    configure();
    expect(await redirectOf(AccountPage())).toBe("/sign-in?returnTo=%2Faccount");
  });

  it("shows the profile and says progress stays in this browser", async () => {
    configure();
    session.current = {
      status: "signed-in",
      user: { name: "Ada Lovelace", email: "ada@example.com", picture: null },
    };
    render(await AccountPage());
    const profile = screen.getByTestId("account-profile");
    expect(profile).toHaveTextContent("Ada Lovelace");
    expect(profile).toHaveTextContent("ada@example.com");
    expect(within(profile).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByText(/signing in or out never changes them/)).toBeInTheDocument();
  });
});
