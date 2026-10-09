import {
  createMemoryStorage,
  ProgressRepository,
  type ProgressCatalog,
  type ProgressOwner,
  type ProgressStorage,
} from "@gitdojo/progress";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initProgress,
  resetProgressStoreForTests,
  useProgressStore,
  type AccountResolution,
} from "@/features/progress/state/use-progress-store";
import { ReleaseAnnouncementPage } from "./components/ReleaseAnnouncementPage";
import { ReleaseBanner } from "./components/ReleaseBanner";
import { type ReleaseInfo } from "./services/release-info";
import { resetSeenOnDeviceForTests, seenOnDevice } from "./services/seen-on-device";

const navigation = vi.hoisted(() => ({ pathname: "/learn" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const RELEASE: ReleaseInfo = {
  version: "v0.1.12",
  publishedAt: "2026-10-09T09:30:00.000Z",
  intro: "Getting unstuck is easier in this release.",
  highlights: [
    "Reveal a hint when an objective has you stuck.",
    "Practise `git restore` in a new lesson.",
  ],
};

const CATALOG: ProgressCatalog = { courses: [], lessons: [], challenges: [] };

/** One page load: progress from `storage`, as whoever `resolveAccount` says. */
async function load(
  storage: ProgressStorage,
  resolveAccount: () => Promise<AccountResolution> = () => Promise.resolve({ kind: "anonymous" }),
) {
  resetProgressStoreForTests();
  await act(() =>
    initProgress(
      CATALOG,
      (catalog, owner: ProgressOwner) => new ProgressRepository({ storage, catalog, owner }),
      { resolveAccount, fetcher: () => Promise.resolve(new Response(null, { status: 503 })) },
    ),
  );
}

const seenInProgress = (version: string) =>
  useProgressStore.getState().progress?.seenReleases[version] !== undefined;

const banner = () => screen.queryByRole("complementary", { name: /GitDojo v0\.1\.12 is here/ });

/** The banner with something focusable after it, as in the real layout. */
function renderBanner(release: ReleaseInfo = RELEASE) {
  return render(
    <>
      <ReleaseBanner release={release} />
      <button type="button">Account</button>
    </>,
  );
}

beforeEach(() => {
  navigation.pathname = "/learn";
  resetProgressStoreForTests();
  resetSeenOnDeviceForTests();
  vi.restoreAllMocks();
});

describe("What's new page", () => {
  it("shows the version, date, introduction and highlights with a clear hierarchy", () => {
    render(<ReleaseAnnouncementPage release={RELEASE} />);
    const article = screen.getByRole("article", { name: "GitDojo v0.1.12" });
    expect(article).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "GitDojo v0.1.12" })).toBeInTheDocument();
    expect(screen.getByText("October 9, 2026")).toHaveAttribute(
      "datetime",
      "2026-10-09T09:30:00.000Z",
    );
    expect(screen.getByText("Getting unstuck is easier in this release.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "What you’ll notice" }),
    ).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Reveal a hint when an objective has you stuck.",
      "Practise git restore in a new lesson.",
    ]);
    expect(screen.getByText("git restore").tagName).toBe("CODE");
    // Nothing from the technical changelog, and no way into it from here.
    expect(screen.queryByText(/What’s Changed|dependabot|pull\//i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/learn",
    ]);
  });

  it("falls back to a friendly introduction", () => {
    render(<ReleaseAnnouncementPage release={{ ...RELEASE, intro: null }} />);
    expect(screen.getByText("Here’s what’s new for you in this release.")).toBeInTheDocument();
  });

  it("stays useful before the first release, and marks nothing seen", () => {
    render(<ReleaseAnnouncementPage release={{ ...RELEASE, version: null }} />);
    expect(screen.getByRole("heading", { level: 2, name: "No releases yet" })).toBeInTheDocument();
  });

  it("marks the release seen when the learner opens it", async () => {
    const storage = createMemoryStorage();
    await load(storage);
    render(<ReleaseAnnouncementPage release={RELEASE} />);
    await waitFor(() => {
      expect(seenInProgress("v0.1.12")).toBe(true);
    });
    expect(seenOnDevice("v0.1.12")).toBe(true);
  });
});

describe("release banner", () => {
  it("waits for the learner's progress before showing, so a dismissed release never flashes", async () => {
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
    await load(createMemoryStorage());
    expect(banner()).toBeInTheDocument();
  });

  it("links to What's new, has a labelled dismiss button, and is not marked seen just by showing", async () => {
    await load(createMemoryStorage());
    renderBanner();
    expect(screen.getByRole("link", { name: "See what’s new" })).toHaveAttribute(
      "href",
      "/whats-new",
    );
    expect(
      screen.getByRole("button", { name: "Dismiss the GitDojo v0.1.12 announcement" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/with 2 updates for learners/)).toBeInTheDocument();
    expect(seenInProgress("v0.1.12")).toBe(false);
    expect(seenOnDevice("v0.1.12")).toBe(false);
  });

  it("dismisses from the keyboard, keeps focus on the page and says what happened", async () => {
    const user = userEvent.setup();
    await load(createMemoryStorage());
    renderBanner();
    const dismiss = screen.getByRole("button", { name: /Dismiss/ });
    dismiss.focus();
    await user.keyboard("{Enter}");

    expect(banner()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Announcement dismissed.");
    await waitFor(() => {
      expect(seenInProgress("v0.1.12")).toBe(true);
    });
    expect(seenOnDevice("v0.1.12")).toBe(true);
  });

  it("stays dismissed after a reload, from saved progress alone", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage();
    await load(storage);
    const { unmount } = renderBanner();
    await user.click(screen.getByRole("button", { name: /Dismiss/ }));
    await waitFor(() => {
      expect(useProgressStore.getState().saving).toBe(false);
    });
    unmount();

    // Even without this browser's own copy, the learner's saved progress remembers.
    resetSeenOnDeviceForTests();
    await load(storage);
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it("stays dismissed when progress could not be saved, from this browser's copy", async () => {
    const user = userEvent.setup();
    await load(createMemoryStorage());
    const { unmount } = renderBanner();
    await user.click(screen.getByRole("button", { name: /Dismiss/ }));
    unmount();

    // A fresh, empty progress record: as if IndexedDB had been unavailable.
    await load(createMemoryStorage());
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it("holds for this tab even when localStorage is blocked", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    await load(createMemoryStorage());
    renderBanner();
    await user.click(screen.getByRole("button", { name: /Dismiss/ }));
    expect(banner()).not.toBeInTheDocument();
  });

  it("shows again for the next release", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage();
    await load(storage);
    const { unmount } = renderBanner();
    await user.click(screen.getByRole("button", { name: /Dismiss/ }));
    unmount();

    await load(storage);
    renderBanner({ ...RELEASE, version: "v0.1.13" });
    expect(
      screen.getByRole("complementary", { name: /GitDojo v0\.1\.13 is here/ }),
    ).toBeInTheDocument();
  });

  it("hides when another tab dismisses it", async () => {
    await load(createMemoryStorage());
    renderBanner();
    expect(banner()).toBeInTheDocument();
    act(() => {
      localStorage.setItem("gitdojo:seen-releases", JSON.stringify(["v0.1.12"]));
      window.dispatchEvent(new StorageEvent("storage", { key: "gitdojo:seen-releases" }));
    });
    expect(banner()).not.toBeInTheDocument();
  });

  it("stays hidden for a signed-in learner who saw it on another device", async () => {
    await load(createMemoryStorage(), () =>
      Promise.resolve({
        kind: "account",
        accountId: "ada",
        lessons: {},
        activity: {
          counters: { commandStats: {}, playgroundSessions: 0 },
          revealedHints: {},
          seenReleases: { "v0.1.12": Date.UTC(2026, 9, 9) },
        },
      }),
    );
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it("is not shown on the What's new page itself", async () => {
    navigation.pathname = "/whats-new";
    await load(createMemoryStorage());
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it("does nothing before the first release", async () => {
    await load(createMemoryStorage());
    renderBanner({ ...RELEASE, version: null });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
