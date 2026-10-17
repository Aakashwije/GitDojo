import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VerifyPage, { generateMetadata } from "@/app/verify/[id]/page";
import NotFoundPage from "@/app/verify/[id]/not-found";
import type { PublicCertificate } from "@/lib/certificates/public-view";
import type { CredentialLookup } from "@/lib/certificates/verification";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/components/site/site-header", () => ({ SiteHeader: () => null }));
class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));
const lookup = vi.hoisted((): { current: CredentialLookup } => ({
  current: { status: "not-found" },
}));
vi.mock("@/lib/certificates/verification", () => ({
  lookupCredential: () => Promise.resolve(lookup.current),
}));

const ID = "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c";
const params = (id = ID) => ({ params: Promise.resolve({ id }) });

function found(
  overrides: Partial<Extract<PublicCertificate, { kind: "completion" }>> = {},
): CredentialLookup {
  return {
    status: "found",
    certificate: {
      kind: "completion",
      id: ID,
      title: "Git Foundations",
      description: "GitDojo completion certificate for foundational Git lessons and practice.",
      holderName: null,
      issuedAt: new Date("2026-10-17T10:05:00Z"),
      revokedAt: null,
      awardKey: "git-foundations",
      criteriaVersion: 1,
      criteria: "Complete 10 named lessons and 1 named Practice mode tasks in GitDojo.",
      lessons: ["what-is-git"],
      practice: ["commit-one-change"],
      ...overrides,
    },
    lessons: [{ id: "what-is-git", title: "What is Git?", course: "Git Basics" }],
    practice: [{ id: "commit-one-change", title: "Commit One Change" }],
    checkedAt: new Date("2026-10-18T09:00:00Z"),
  };
}

async function show() {
  render(await VerifyPage(params()));
}

beforeEach(() => {
  lookup.current = { status: "not-found" };
});

describe("/verify/[id]", () => {
  it("shows a valid certificate with its details, criteria and a withheld name", async () => {
    lookup.current = found();
    await show();
    const status = screen.getByTestId("credential-status");
    expect(status).toHaveAttribute("data-status", "valid");
    expect(screen.getByTestId("credential-status-label")).toHaveTextContent("Valid");
    expect(status).toHaveTextContent("has not been revoked");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Git Foundations");
    expect(screen.getByTestId("credential-holder")).toHaveTextContent("Name withheld by learner");
    expect(screen.queryByText("Ada Lovelace")).toBeNull();
    expect(screen.getByTestId("credential-issued")).toHaveTextContent(
      "October 17, 2026 at 10:05 UTC",
    );
    expect(screen.getByTestId("credential-id")).toHaveTextContent(ID);
    expect(screen.getByText("Version 1")).toBeInTheDocument();
    expect(screen.getByText("GitDojo", { selector: "dd" })).toBeInTheDocument();
    const criteria = within(screen.getByRole("region", { name: "What it was awarded for" }));
    expect(criteria.getByText("What is Git?")).toBeInTheDocument();
    expect(criteria.getByText("Commit One Change")).toBeInTheDocument();
    expect(screen.getByText(/not proof of assessed Git proficiency/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /signed Open Badge/ })).toHaveAttribute(
      "href",
      `/api/credentials/${ID}`,
    );
  });

  it("shows the stored name when the holder agreed to show it", async () => {
    lookup.current = found({ holderName: "Ada Lovelace" });
    await show();
    expect(screen.getByTestId("credential-holder")).toHaveTextContent("Ada Lovelace");
  });

  it("never shows a revoked certificate as valid", async () => {
    lookup.current = found({ revokedAt: new Date("2026-11-01T08:00:00Z") });
    await show();
    const status = screen.getByTestId("credential-status");
    expect(status).toHaveAttribute("data-status", "revoked");
    expect(screen.getByTestId("credential-status-label")).toHaveTextContent("Revoked");
    expect(status).toHaveTextContent("revoked this certificate on November 1, 2026 (UTC)");
    expect(status).toHaveTextContent("including any PDF or Open Badge shared before then");
    expect(screen.queryByText("Valid")).toBeNull();
    expect(screen.queryByRole("link", { name: /signed Open Badge/ })).toBeNull();
  });

  it("shows a server-graded credential's rubric results instead of lessons", async () => {
    lookup.current = {
      status: "found",
      certificate: {
        kind: "assessed",
        id: ID,
        title: "Git Skills Capstone",
        description: "Server-graded Git history.",
        holderName: null,
        issuedAt: new Date("2026-10-17T10:05:00Z"),
        revokedAt: null,
        awardKey: "git-skills-capstone",
        criteriaVersion: 1,
        criteria: "Pass every rubric item.",
        attemptId: "attempt-1",
        grade: {
          passed: true,
          rubricVersion: 1,
          criteria: [
            { id: "commits", passed: true, feedback: "Commits recorded." },
            { id: "recovery", passed: true, feedback: "Lost work recovered." },
          ],
        },
      },
      lessons: [],
      practice: [],
      checkedAt: new Date("2026-10-18T09:00:00Z"),
    };
    await show();
    expect(
      screen.getByText("Server-graded skills credential issued by GitDojo"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("credential-status")).toHaveTextContent(
      "This credential is in GitDojo's issuance records",
    );
    const results = screen.getAllByTestId("grade-criterion");
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveTextContent("Passed: Commits recorded.");
    expect(screen.getByText(/isolated attempt/)).toHaveTextContent("attempt-1");
    expect(screen.queryByText(/Lessons \(/)).toBeNull();
    expect(screen.getByText("What a server-graded credential means")).toBeInTheDocument();
    expect((await generateMetadata(params())).title).toBe(
      "Git Skills Capstone skills credential (Valid)",
    );
  });

  it("shows the not-found page for an unknown or malformed id", async () => {
    await expect(VerifyPage(params("not-an-id"))).rejects.toBeInstanceOf(NotFound);
    render(<NotFoundPage />);
    expect(screen.getByTestId("credential-not-found")).toHaveTextContent("Credential not found");
  });

  it("neither confirms nor denies a credential when the records can't be read", async () => {
    lookup.current = { status: "unavailable" };
    await show();
    expect(screen.getByTestId("credential-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("credential-status")).toBeNull();
  });
});

describe("/verify/[id] metadata", () => {
  it("is never indexed, and names the holder only with consent", async () => {
    lookup.current = found();
    const withheld = await generateMetadata(params());
    expect(withheld.robots).toMatchObject({ index: false, follow: false });
    expect(withheld.title).toBe("Git Foundations completion certificate (Valid)");
    expect(withheld.description).toBe(
      "Valid: a GitDojo completion certificate issued on October 17, 2026 (UTC).",
    );
    expect(JSON.stringify(withheld)).not.toContain("Ada");

    lookup.current = found({ holderName: "Ada Lovelace", revokedAt: new Date() });
    const shown = await generateMetadata(params());
    expect(shown.description).toBe(
      "Revoked: a GitDojo completion certificate issued to Ada Lovelace on October 17, 2026 (UTC).",
    );

    lookup.current = { status: "not-found" };
    expect(await generateMetadata(params("nope"))).toMatchObject({
      title: "Credential not found",
      robots: { index: false },
    });
  });
});
