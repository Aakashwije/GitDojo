import {
  applyProgressAction,
  emptyProgress,
  type LocalProgress,
  type ProgressAction,
  type ProgressCatalog,
} from "@gitdojo/progress";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ProgressFeature from "@/features/progress";
import { resetProgressStoreForTests, useProgressStore } from "@/features/progress";
import { AWARDS } from "@/lib/certificates/awards";
import { CertificateAwards } from "./components/CertificateAwards";
import { awardProgress } from "./services/award-progress";

vi.mock("@/features/progress", async (importOriginal) => ({
  ...(await importOriginal<typeof ProgressFeature>()),
  syncCompletionsNow: () => Promise.resolve(),
  syncNow: () => Promise.resolve(),
}));

const FOUNDATIONS = AWARDS["git-foundations"];

const CATALOG: ProgressCatalog = {
  courses: [
    {
      id: "git-basics",
      slug: "git-basics",
      title: "Git Basics",
      description: "",
      difficulty: "beginner",
      lessons: FOUNDATIONS.lessons.map((id, index) => ({
        id,
        slug: id,
        title: `Lesson ${id}`,
        type: "interactive" as const,
        number: index + 1,
      })),
    },
  ],
  lessons: [],
  challenges: [],
  practice: [
    {
      id: "commit-one-change",
      title: "Commit One Change",
      skill: "commits",
      difficulty: "beginner",
    },
  ],
  concepts: {},
};

const lesson = (id: string): ProgressAction => ({
  type: "complete",
  content: { kind: "lesson", id, type: "interactive", courseId: "git-basics" },
});

function progressWith(actions: ProgressAction[], account = false): LocalProgress {
  const start = emptyProgress(Date.now(), {
    owner: account ? { kind: "account", accountId: "user-1" } : { kind: "anonymous" },
  });
  return actions.reduce(
    (progress, action) => applyProgressAction(progress, action, Date.now()),
    start,
  );
}

const allFoundations = [
  ...FOUNDATIONS.lessons.map(lesson),
  { type: "complete", content: { kind: "practice", id: "commit-one-change" } } as const,
];

const card = (key: string) =>
  within(
    screen.getAllByTestId("certificate").find((element) => element.dataset.award === key) ??
      document.body,
  );

beforeEach(() => {
  resetProgressStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("awardProgress", () => {
  it("counts requirements and names the next one, lessons first", () => {
    const status = awardProgress(
      "git-foundations",
      progressWith([lesson("what-is-git"), lesson("git-vs-github")]),
      CATALOG,
    );
    expect(status).toMatchObject({ done: 2, total: 11, remaining: 9, percent: 18 });
    expect(status.next).toEqual({
      kind: "lesson",
      id: "git-init",
      title: "Lesson git-init",
      href: "/learn/git-basics/git-init",
    });
  });

  it("moves on to Practice tasks, and has nothing next when every requirement is done", () => {
    const lessonsOnly = progressWith(FOUNDATIONS.lessons.map(lesson));
    expect(awardProgress("git-foundations", lessonsOnly, CATALOG).next).toMatchObject({
      kind: "practice",
      href: "/practice/commit-one-change",
    });
    expect(awardProgress("git-foundations", progressWith(allFoundations), CATALOG)).toMatchObject({
      remaining: 0,
      percent: 100,
      next: null,
    });
  });

  it("names content missing from the catalog without linking to it", () => {
    const next = awardProgress("branching-collaboration", progressWith([]), CATALOG).next;
    expect(next).toEqual({ kind: "lesson", id: "what-is-a-branch", title: "what-is-a-branch" });
  });
});

describe("CertificateAwards", () => {
  it("shows a signed-out learner how close they are, and that certificates need an account", () => {
    render(
      <CertificateAwards progress={progressWith([lesson("what-is-git")])} catalog={CATALOG} />,
    );
    expect(screen.getByTestId("certificates-sign-in")).toHaveTextContent(
      "work done while signed out doesn't count towards them",
    );
    const foundations = card("git-foundations");
    expect(foundations.getByTestId("certificate-count")).toHaveTextContent("1 of 11 requirements");
    expect(foundations.getByText("10 left")).toBeInTheDocument();
    expect(foundations.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "1 of 11 requirements",
    );
    expect(foundations.getByRole("link", { name: /Lesson git-vs-github/ })).toHaveAttribute(
      "href",
      "/learn/git-basics/git-vs-github",
    );
    expect(screen.queryByRole("button", { name: "Issue certificate" })).toBeNull();
    expect(screen.getByText(/not an assessment of Git proficiency/)).toBeInTheDocument();
  });

  it("explains the public name choice, then issues with it and unlocks the award", async () => {
    let issued: unknown[] = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        issued = [
          {
            id: "cert-1",
            awardKey: "git-foundations",
            criteriaVersion: 1,
            recipientName: "Ada Lovelace",
            issuedAt: "2026-10-17T10:00:00.000Z",
            revoked: false,
            publicNameConsent: true,
          },
        ];
        return Promise.resolve(Response.json({ id: "cert-1" }));
      }
      return Promise.resolve(Response.json({ certificates: issued }));
    });
    vi.stubGlobal("fetch", fetchMock);
    useProgressStore.setState({ mode: "account" });
    render(<CertificateAwards progress={progressWith(allFoundations, true)} catalog={CATALOG} />);

    const button = await card("git-foundations").findByRole("button", {
      name: "Issue certificate",
    });
    const choice = screen.getByRole("group", { name: "Your name on the certificate you issue" });
    expect(within(choice).getByRole("radio", { name: /Keep my name private/ })).toBeChecked();
    const user = userEvent.setup();
    await user.click(within(choice).getByRole("radio", { name: /Show my name publicly/ }));
    await user.click(button);

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      awardKey: "git-foundations",
      publicNameConsent: true,
    });
    const earned = await card("git-foundations").findByTestId("certificate-earned");
    expect(earned).toHaveClass("animate-gd-enter");
    expect(earned).toHaveTextContent("Issued October 17, 2026");
    expect(within(earned).getByRole("link", { name: "Verify" })).toHaveAttribute(
      "href",
      "/verify/cert-1",
    );
    expect(within(earned).getByRole("link", { name: "PDF" })).toHaveAttribute(
      "href",
      "/api/certificates/cert-1/pdf",
    );
    expect(within(earned).getByRole("link", { name: "Open Badge" })).toHaveAttribute(
      "href",
      "/api/credentials/cert-1",
    );
    expect(card("git-foundations").getByText("Earned")).toHaveClass("animate-gd-pop");
    expect(screen.getByRole("status")).toHaveTextContent("Git Foundations certificate issued.");
    // Nothing left to issue, so the name choice is gone.
    expect(screen.queryByRole("group", { name: /Your name/ })).toBeNull();
  });

  it("shows an earlier certificate as earned without replaying the unlock, and a revoked one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            certificates: [
              {
                id: "cert-1",
                awardKey: "git-foundations",
                criteriaVersion: 1,
                recipientName: "Ada",
                issuedAt: "2026-09-01T10:00:00.000Z",
                revoked: false,
                publicNameConsent: false,
              },
              {
                id: "cert-2",
                awardKey: "git-recovery-history",
                criteriaVersion: 1,
                recipientName: "Ada",
                issuedAt: "2026-09-02T10:00:00.000Z",
                revoked: true,
                publicNameConsent: false,
              },
            ],
          }),
        ),
      ),
    );
    useProgressStore.setState({ mode: "account" });
    render(<CertificateAwards progress={progressWith(allFoundations, true)} catalog={CATALOG} />);
    const earned = await card("git-foundations").findByTestId("certificate-earned");
    expect(earned).not.toHaveClass("animate-gd-enter");
    expect(earned).toHaveTextContent("Name on the public page: withheld");
    expect(card("git-recovery-history").getByText("Revoked")).toBeInTheDocument();
    expect(card("git-recovery-history").getByTestId("certificate-earned")).toHaveTextContent(
      "Issued, then revoked by GitDojo",
    );
  });

  it("says when the account can't be reached", () => {
    useProgressStore.setState({ mode: "account-unavailable" });
    render(<CertificateAwards progress={progressWith([])} catalog={CATALOG} />);
    expect(screen.getByTestId("certificates-unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
