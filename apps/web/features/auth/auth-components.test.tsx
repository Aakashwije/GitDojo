import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountControls } from "./components/AccountControls";
import { AuthNotice } from "./components/AuthNotice";
import { AuthStartButton } from "./components/AuthStartButton";
import { SignOutRunner } from "./components/SignOutRunner";
import { markSignOutIntent } from "./services/sign-out-intent";
import { resetAccountSessionForTests, SIGNED_IN_HINT_KEY } from "./state/use-account-session";
import { type AccountSession } from "./types";

// The SDK, the server action and the router are the boundaries; everything else is real.
const authClient = vi.hoisted(() => ({
  signIn: vi.fn<() => Promise<unknown>>(),
  signOut: vi.fn<() => Promise<unknown>>(),
  isLoading: false,
}));
const navigation = vi.hoisted(() => ({ assign: vi.fn<(url: string) => void>() }));
vi.mock("./services/auth-client", () => ({
  useAuthClient: () => authClient,
  browserNavigation: navigation,
}));
const rememberReturnPath = vi.hoisted(() => vi.fn<(path: string) => Promise<void>>());
vi.mock("./actions", () => ({ rememberReturnPath }));
const router = vi.hoisted(() => ({ push: vi.fn<(href: string) => void>() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function serveSession(session: AccountSession) {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json(session)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  authClient.isLoading = false;
  authClient.signIn.mockResolvedValue(undefined);
  authClient.signOut.mockResolvedValue({ redirected: true, location: "https://idp/logout" });
  rememberReturnPath.mockResolvedValue(undefined);
  resetAccountSessionForTests();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/learn/git-basics/git-init?tab=terminal");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AuthStartButton", () => {
  it("remembers the destination, then starts the hosted sign-in once", async () => {
    const user = userEvent.setup();
    render(<AuthStartButton label="Sign in" returnTo="/learn/merging" />);
    const button = screen.getByRole("button", { name: "Sign in" });
    await user.click(button);
    await user.click(button);

    expect(rememberReturnPath).toHaveBeenCalledExactlyOnceWith("/learn/merging");
    expect(authClient.signIn).toHaveBeenCalledOnce();
    expect(rememberReturnPath.mock.invocationCallOrder[0]).toBeLessThan(
      authClient.signIn.mock.invocationCallOrder[0] ?? 0,
    );
    expect(screen.getByRole("button", { name: "Redirecting…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Redirecting to the secure sign-in page");
  });

  it("uses the same hosted flow for creating an account", async () => {
    render(<AuthStartButton label="Create account" returnTo="/learn" />);
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(authClient.signIn).toHaveBeenCalledOnce();
  });

  it("waits for the SDK before it can be pressed", () => {
    authClient.isLoading = true;
    render(<AuthStartButton label="Sign in" returnTo="/learn" />);
    expect(screen.getByRole("button", { name: "Preparing…" })).toBeDisabled();
  });

  it("shows a generic error and allows a retry when starting fails", async () => {
    authClient.signIn.mockRejectedValueOnce(new Error("invalid_client: secret mismatch"));
    render(<AuthStartButton label="Sign in" returnTo="/learn" />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("couldn't reach the sign-in service");
    expect(alert).not.toHaveTextContent("invalid_client");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(authClient.signIn).toHaveBeenCalledTimes(2);
  });

  it("resets when the learner comes back from the sign-in page", async () => {
    render(<AuthStartButton label="Sign in" returnTo="/learn" />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    act(() => {
      const event = new Event("pageshow") as PageTransitionEvent;
      Object.defineProperty(event, "persisted", { value: true });
      window.dispatchEvent(event);
    });
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});

describe("SignOutRunner", () => {
  it("signs out straight away after choosing Sign out in the menu", async () => {
    markSignOutIntent();
    render(<SignOutRunner />);
    expect(await screen.findByTestId("signing-out")).toHaveTextContent("Signing you out");
    expect(authClient.signOut).toHaveBeenCalledOnce();
    expect(navigation.assign).not.toHaveBeenCalled();
  });

  it("asks first when opened any other way", async () => {
    render(<SignOutRunner />);
    expect(authClient.signOut).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(authClient.signOut).toHaveBeenCalledOnce();
  });

  it("still lands on the signed-out page when the provider does not redirect", async () => {
    authClient.signOut.mockRejectedValueOnce(new Error("network"));
    markSignOutIntent();
    render(<SignOutRunner />);
    await waitFor(() => {
      expect(navigation.assign).toHaveBeenCalledWith("/auth/signed-out");
    });
  });

  it("leaves learning progress and other browser data alone", async () => {
    localStorage.setItem("gitdojo:playground", '{"state":{"scenarioId":"simple"}}');
    localStorage.setItem(SIGNED_IN_HINT_KEY, "1");
    markSignOutIntent();
    render(<SignOutRunner />);
    await waitFor(() => {
      expect(authClient.signOut).toHaveBeenCalled();
    });
    expect(localStorage.getItem("gitdojo:playground")).not.toBeNull();
    // Only the "was signed in" hint is cleared, so this is not reported as an expired session.
    expect(localStorage.getItem(SIGNED_IN_HINT_KEY)).toBeNull();
  });
});

describe("AccountControls", () => {
  it("reserves space while loading, then hides itself when accounts are not set up", async () => {
    serveSession({ status: "unconfigured" });
    const { container } = render(<AccountControls />);
    expect(screen.getByTestId("account-loading")).toBeInTheDocument();
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  it("offers sign-in and sign-up, returning to the current page", async () => {
    serveSession({ status: "signed-out" });
    render(<AccountControls />);
    const signIn = await screen.findByRole("link", { name: "Sign in" });
    const returnTo = encodeURIComponent("/learn/git-basics/git-init?tab=terminal");
    expect(signIn).toHaveAttribute("href", `/sign-in?returnTo=${returnTo}`);
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      `/sign-up?returnTo=${returnTo}`,
    );
  });

  it("is a single sign-in link in compact workspace headers", async () => {
    serveSession({ status: "signed-out" });
    render(<AccountControls compact />);
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
  });

  it("shows the signed-in learner with a keyboard-operable account menu", async () => {
    serveSession({
      status: "signed-in",
      user: { name: "Ada Lovelace", email: "ada@example.com", picture: null },
    });
    const user = userEvent.setup();
    render(<AccountControls />);
    const trigger = await screen.findByRole("button", { name: "Account menu for Ada Lovelace" });
    expect(screen.getByTestId("account-name")).toHaveTextContent("Ada Lovelace");
    expect(screen.getAllByTestId("account-avatar")[0]).toHaveTextContent("AL");

    trigger.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("ada@example.com")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Account" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(within(menu).getByRole("menuitem", { name: "Dashboard" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });

  it("signs out from the menu", async () => {
    serveSession({
      status: "signed-in",
      user: { name: "Ada Lovelace", email: null, picture: null },
    });
    const user = userEvent.setup();
    render(<AccountControls />);
    await user.click(await screen.findByRole("button", { name: /Account menu/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(router.push).toHaveBeenCalledWith("/auth/sign-out");
    expect(sessionStorage.getItem("gitdojo:sign-out-intent")).not.toBeNull();
  });

  it("tells a learner whose session ended on its own", async () => {
    localStorage.setItem(SIGNED_IN_HINT_KEY, "1");
    serveSession({ status: "signed-out" });
    render(<AccountControls />);
    const notice = await screen.findByTestId("session-expired");
    expect(notice).toHaveTextContent("Your session has ended");
    expect(within(notice).getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      expect.stringContaining("/sign-in?returnTo="),
    );
    await userEvent.click(within(notice).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("session-expired")).toBeNull();
  });

  it("hides account controls when the session endpoint fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline"))),
    );
    const { container } = render(<AccountControls />);
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });
});

describe("AuthNotice", () => {
  it.each([
    ["cancelled", "status", "Sign-in was cancelled"],
    ["failed", "alert", "We couldn't sign you in"],
    ["expired", "status", "Your session has ended"],
  ])("explains %s", (status, role, text) => {
    render(<AuthNotice status={status} />);
    expect(screen.getByRole(role)).toHaveTextContent(text);
  });

  it("ignores anything else, including provider error text", () => {
    const { container } = render(<AuthNotice status="invalid_request: redirect_uri mismatch" />);
    expect(container).toBeEmptyDOMElement();
  });
});
