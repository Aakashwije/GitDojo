// @vitest-environment node
import { jsPDF } from "jspdf";
import { inflateSync } from "node:zlib";
import type QRCode from "qrcode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AWARDS, criteriaNarrative } from "./awards";
import { badgePayload, verificationUrl } from "./credential";
import { isCredentialId, verificationPath } from "./ids";
import { certificatePdf, fitName } from "./pdf";
import { formatCredentialTime, publicCertificate } from "./public-view";
import type { Certificate } from "./store";
import { lookupCredential } from "./verification";

vi.mock("server-only", () => ({}));
const store = vi.hoisted(() => ({ find: vi.fn<(id: string) => Promise<Certificate | null>>() }));
vi.mock("./store", () => ({ findCertificate: store.find, revokedIndexes: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDatabase: vi.fn() }));
vi.mock("@/lib/progress-catalog", () => ({
  loadProgressCatalog: () =>
    Promise.resolve({
      courses: [
        {
          id: "git-basics",
          slug: "git-basics",
          title: "Git Basics",
          description: "",
          difficulty: "beginner",
          lessons: [
            {
              id: "what-is-git",
              slug: "what-is-git",
              title: "What is Git?",
              type: "concept",
              number: 1,
            },
          ],
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
    }),
}));
const qr = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("qrcode", async (importOriginal) => {
  const real = (await importOriginal<{ default: typeof QRCode }>()).default;
  return {
    default: {
      toDataURL: (text: string, options: object) => {
        qr.urls.push(text);
        return real.toDataURL(text, options);
      },
    },
  };
});

const ID = "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c";
const ORIGIN = "https://gitdojo-staging.example.org";

function certificate(overrides: Partial<Certificate> = {}): Certificate {
  const award = AWARDS["git-foundations"];
  return {
    id: ID,
    statusIndex: 7,
    userId: "8b0c6f8e-private-user-id",
    awardKey: "git-foundations",
    credentialKind: "completion",
    criteriaVersion: 1,
    recipientName: "Ada Lovelace",
    publicNameConsent: false,
    issuedAt: new Date("2026-10-17T10:05:00Z"),
    revokedAt: null,
    evidence: {
      kind: "completion",
      title: award.title,
      description: award.description,
      template: award.template,
      criteria: criteriaNarrative("git-foundations"),
      lessons: [...award.lessons],
      practice: [...award.practice],
    },
    ...overrides,
  };
}

/** The text of an uncompressed PDF, with its content streams inflated if needed. */
function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map((match) => {
    const body = Buffer.from(match[1] ?? "", "latin1");
    try {
      return inflateSync(body).toString("latin1");
    } catch {
      return body.toString("latin1");
    }
  });
  return [raw, ...streams].join("\n");
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  store.find.mockReset();
  qr.urls = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("credential ids and URLs", () => {
  it("accepts the database's UUIDs in any case, and nothing else", () => {
    expect(isCredentialId(ID)).toBe(true);
    expect(isCredentialId(ID.toUpperCase())).toBe(true);
    // The verification page used to accept only four groups, so real ids were never found.
    expect(isCredentialId("3f2b8c1e-9a4d-4e7b-1d5e6f7a8b9c")).toBe(false);
    for (const bad of ["", "not-an-id", `${ID}x`, `${ID}/../admin`, ID.replaceAll("-", "")]) {
      expect(isCredentialId(bad)).toBe(false);
    }
  });

  it("builds the verification URL from the configured origin, never a fixed domain", () => {
    expect(verificationUrl(ID)).toBe(`${ORIGIN}${verificationPath(ID)}`);
    expect(verificationUrl(ID)).toBe(`${ORIGIN}/verify/${ID}`);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gitdojo.example.com/");
    expect(verificationUrl(ID)).toBe(`https://gitdojo.example.com/verify/${ID}`);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://gitdojo.example.com");
    expect(() => verificationUrl(ID)).toThrow(/HTTPS/);
  });

  it("cites the same URL in the signed badge's evidence", () => {
    expect(badgePayload(certificate()).evidence[0]?.id).toBe(verificationUrl(ID));
  });

  it("formats times with an explicit UTC time zone", () => {
    expect(formatCredentialTime(new Date("2026-10-17T23:30:00Z"))).toBe(
      "October 17, 2026 at 23:30 UTC",
    );
  });
});

describe("publicCertificate", () => {
  it("shows the stored name only with the holder's consent", () => {
    expect(publicCertificate(certificate({ publicNameConsent: true })).holderName).toBe(
      "Ada Lovelace",
    );
    const withheld = publicCertificate(certificate());
    expect(withheld.holderName).toBeNull();
    const json = JSON.stringify(withheld);
    for (const secret of ["Ada Lovelace", "private-user-id", "statusIndex", "userId"]) {
      expect(json).not.toContain(secret);
    }
  });
});

describe("assessed credentials", () => {
  const assessed = () =>
    certificate({
      awardKey: "git-skills-capstone",
      credentialKind: "assessed",
      evidence: {
        kind: "assessed",
        title: "Git Skills Capstone",
        description: "Server-graded Git history.",
        criteria: "Pass every rubric item.",
        attemptId: "attempt-1",
        grade: {
          passed: true,
          rubricVersion: 1,
          criteria: [{ id: "commits", passed: true, feedback: "Commits recorded." }],
        },
      },
    });

  it("show their server grade publicly, and never the private fields", () => {
    const view = publicCertificate(assessed());
    expect(view).toMatchObject({
      kind: "assessed",
      attemptId: "attempt-1",
      grade: { passed: true, criteria: [{ id: "commits", passed: true }] },
    });
    expect(JSON.stringify(view)).not.toContain("private-user-id");
  });

  it("are looked up without lesson titles", async () => {
    store.find.mockResolvedValue(assessed());
    const lookup = await lookupCredential("33333333-3333-4333-8333-333333333333");
    expect(lookup).toMatchObject({ status: "found", lessons: [], practice: [] });
  });

  it("have no PDF certificate", async () => {
    await expect(certificatePdf(assessed())).rejects.toThrow(/do not use PDF templates/);
  });
});

describe("certificate PDF", () => {
  it("prints the exact verification URL and id, and its QR code encodes the same URL", async () => {
    const text = pdfText(await certificatePdf(certificate(), { compress: false }));
    const url = `${ORIGIN}/verify/${ID}`;
    expect(qr.urls).toEqual([url]);
    expect(text).toContain(`(Verify at ${url})`);
    expect(text).toContain(`(Credential ID: ${ID})`);
    expect(text).toContain(`/URI (${url})`);
    expect(text).toContain("(Ada Lovelace)");
  });

  it("keeps a long name on the name line: one line if it fits, otherwise two", () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFont("times", "bold");
    expect(fitName(doc, "Ada Lovelace")).toEqual({ size: 30, lines: ["Ada Lovelace"] });
    const long = "Maximiliana Wolfeschlegelsteinhausenbergerdorff-Ramaswamy Nakamura-Okonkwo";
    const fitted = fitName(doc, long);
    expect(fitted.lines).toHaveLength(2);
    expect(fitted.size).toBeGreaterThanOrEqual(11);
    doc.setFontSize(fitted.size);
    for (const line of fitted.lines) expect(doc.getTextWidth(line)).toBeLessThanOrEqual(470);
    // The longest name issuance accepts (80 characters) still fits in two lines.
    expect(fitName(doc, "W".repeat(80)).lines.length).toBeLessThanOrEqual(2);
  });
});

describe("lookupCredential", () => {
  it("treats a malformed id as not found without querying the database", async () => {
    expect(await lookupCredential("not-a-credential")).toEqual({ status: "not-found" });
    expect(store.find).not.toHaveBeenCalled();
  });

  it("reports an unknown id as not found", async () => {
    store.find.mockResolvedValue(null);
    expect(await lookupCredential("00000000-0000-4000-8000-000000000000")).toEqual({
      status: "not-found",
    });
  });

  it("never reports a credential as valid when the records can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    store.find.mockRejectedValue(new Error("connection refused"));
    expect(await lookupCredential("11111111-1111-4111-8111-111111111111")).toEqual({
      status: "unavailable",
    });
  });

  it("returns the public view with current titles, and the live revocation", async () => {
    const revokedAt = new Date("2026-11-01T08:00:00Z");
    store.find.mockResolvedValue(certificate({ revokedAt }));
    const lookup = await lookupCredential("22222222-2222-4222-8222-222222222222".toUpperCase());
    expect(store.find).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
    expect(lookup.status).toBe("found");
    if (lookup.status !== "found") return;
    expect(lookup.certificate.revokedAt).toEqual(revokedAt);
    expect(lookup.certificate.holderName).toBeNull();
    expect(lookup.lessons[0]).toEqual({
      id: "what-is-git",
      title: "What is Git?",
      course: "Git Basics",
    });
    // Content no longer in the catalog still shows, by its id.
    expect(lookup.lessons[1]).toEqual({ id: "git-vs-github", title: "git vs github" });
    expect(lookup.practice).toEqual([{ id: "commit-one-change", title: "Commit One Change" }]);
  });
});
