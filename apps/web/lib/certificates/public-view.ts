import type { Certificate } from "./store";

/** The text shown in place of a holder's name they chose not to make public. */
export const NAME_WITHHELD = "Name withheld by learner";

interface PublicCertificateBase {
  id: string;
  title: string;
  description: string;
  /** `null` when the holder chose to keep their name private. */
  holderName: string | null;
  issuedAt: Date;
  /** `null` while the certificate is valid. */
  revokedAt: Date | null;
  awardKey: string;
  criteriaVersion: number;
  criteria: string;
}

/**
 * Everything the public may see about a credential, and nothing else: no account id, no email,
 * and the holder's name only if they agreed to show it when the credential was issued.
 */
export type PublicCertificate = PublicCertificateBase &
  (
    | {
        /** Awarded for learner-reported lesson and Practice completions. */
        kind: "completion";
        lessons: string[];
        practice: string[];
      }
    | {
        /** Awarded for Git history the server graded against a rubric. */
        kind: "assessed";
        attemptId: string;
        grade: {
          passed: boolean;
          rubricVersion: number;
          criteria: { id: string; passed: boolean; feedback: string }[];
        };
      }
  );

export function publicCertificate(certificate: Certificate): PublicCertificate {
  const evidence = certificate.evidence;
  const base: PublicCertificateBase = {
    id: certificate.id,
    title: evidence.title,
    description: evidence.description,
    holderName: certificate.publicNameConsent ? certificate.recipientName : null,
    issuedAt: certificate.issuedAt,
    revokedAt: certificate.revokedAt,
    awardKey: certificate.awardKey,
    criteriaVersion: certificate.criteriaVersion,
    criteria: evidence.criteria,
  };
  if (evidence.kind === "assessed") {
    return {
      ...base,
      kind: "assessed",
      attemptId: evidence.attemptId,
      grade: {
        passed: evidence.grade.passed,
        rubricVersion: evidence.grade.rubricVersion,
        criteria: evidence.grade.criteria.map(({ id, passed, feedback }) => ({
          id,
          passed,
          feedback,
        })),
      },
    };
  }
  return {
    ...base,
    kind: "completion",
    lessons: [...evidence.lessons],
    practice: [...evidence.practice],
  };
}

/** "Completion certificate" or "Server-graded skills credential". */
export function credentialKindLabel(certificate: Pick<PublicCertificate, "kind">): string {
  return certificate.kind === "assessed"
    ? "Server-graded skills credential"
    : "Completion certificate";
}

const DATE = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" });
const TIME = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** "October 17, 2026": the UTC calendar date, so it reads the same everywhere. */
export function formatCredentialDate(date: Date): string {
  return DATE.format(date);
}

/** "October 17, 2026 at 10:05 UTC". */
export function formatCredentialTime(date: Date): string {
  return `${DATE.format(date)} at ${TIME.format(date)} UTC`;
}
