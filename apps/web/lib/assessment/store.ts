import "server-only";

import { randomBytes } from "node:crypto";
import {
  CAPSTONE_KEY,
  CAPSTONE_RUBRIC_VERSION,
  type AssessmentEvidence,
  type AssessmentGrade,
} from "@gitdojo/shared-types";
import { type VerifiedIdentity } from "@/lib/auth/identity";
import { upsertUser } from "@/lib/account-progress/postgres-store";
import { prepareCredentialIssuer } from "@/lib/certificates/credential";
import { getDatabase, type QueryableDatabase } from "@/lib/db/client";
import { type Certificate } from "@/lib/certificates/store";
import { gradeCapstone } from "./grader";
import { CAPSTONE_CRITERIA, CAPSTONE_DESCRIPTION, CAPSTONE_TITLE } from "./rubric";

interface AttemptRow {
  id: string;
  user_id: string;
  nonce: string;
  status: "started" | "passed" | "failed";
  result: AssessmentGrade | null;
}

async function ownedAttempt(
  sql: QueryableDatabase,
  identity: VerifiedIdentity,
  id: string,
  lock = false,
): Promise<AttemptRow | null> {
  const rows = lock
    ? await sql<AttemptRow[]>`
        SELECT a.id, a.user_id, a.nonce, a.status, a.result
        FROM assessment_attempts a JOIN users u ON u.id = a.user_id
        WHERE a.id = ${id} AND u.issuer = ${identity.issuer} AND u.subject = ${identity.subject}
        FOR UPDATE
      `
    : await sql<AttemptRow[]>`
        SELECT a.id, a.user_id, a.nonce, a.status, a.result
        FROM assessment_attempts a JOIN users u ON u.id = a.user_id
        WHERE a.id = ${id} AND u.issuer = ${identity.issuer} AND u.subject = ${identity.subject}
      `;
  return rows[0] ?? null;
}

export async function createAttempt(identity: VerifiedIdentity) {
  return getDatabase().begin(async (tx) => {
    const userId = await upsertUser(tx, identity);
    const nonce = randomBytes(24).toString("base64url");
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO assessment_attempts (user_id, assessment_key, rubric_version, nonce)
      VALUES (${userId}, ${CAPSTONE_KEY}, ${CAPSTONE_RUBRIC_VERSION}, ${nonce})
      RETURNING id
    `;
    if (!row) throw new Error("attempt insert returned no row");
    return { id: row.id, nonce, rubricVersion: CAPSTONE_RUBRIC_VERSION };
  });
}

export async function submitAttempt(
  identity: VerifiedIdentity,
  id: string,
  evidence: AssessmentEvidence,
  publicNameConsent: boolean,
): Promise<{ grade: AssessmentGrade; credentialId: string | null; repeated: boolean } | null> {
  const sql = getDatabase();
  const attempt = await ownedAttempt(sql, identity, id);
  if (!attempt) return null;
  const grade = gradeCapstone(evidence, attempt);
  if (grade.passed) await prepareCredentialIssuer();
  return sql.begin(async (tx) => {
    const current = await ownedAttempt(tx, identity, id, true);
    if (!current) return null;
    if (current.result) {
      const [prior] = await tx<{ id: string }[]>`
        SELECT id FROM certificates WHERE assessment_attempt_id = ${id}
      `;
      return { grade: current.result, credentialId: prior?.id ?? null, repeated: true };
    }
    await tx`
      UPDATE assessment_attempts
      SET status = ${grade.passed ? "passed" : "failed"}, submitted_at = now(),
          result = ${JSON.stringify(grade)}::jsonb, evidence = ${JSON.stringify(evidence)}::jsonb
      WHERE id = ${id}
    `;
    if (!grade.passed) return { grade, credentialId: null, repeated: false };

    const recipientName = identity.name?.trim();
    if (!recipientName || recipientName.length < 2 || recipientName.length > 80)
      throw new Error("printable profile name required");
    const assessedEvidence = {
      kind: "assessed" as const,
      title: CAPSTONE_TITLE,
      description: CAPSTONE_DESCRIPTION,
      criteria: CAPSTONE_CRITERIA,
      attemptId: id,
      grade,
    };
    const insertedRows = await tx<Pick<Certificate, "id">[]>`
      INSERT INTO certificates (
        user_id, award_key, criteria_version, recipient_name, public_name_consent,
        evidence, credential_kind, assessment_attempt_id
      ) VALUES (
        ${current.user_id}, ${CAPSTONE_KEY}, ${CAPSTONE_RUBRIC_VERSION}, ${recipientName},
        ${publicNameConsent}, ${JSON.stringify(assessedEvidence)}::jsonb, 'assessed', ${id}
      )
      ON CONFLICT (user_id, award_key, criteria_version) DO NOTHING
      RETURNING id
    `;
    const inserted = insertedRows.at(0);
    const existingRows = inserted
      ? []
      : await tx<Pick<Certificate, "id">[]>`
          SELECT id FROM certificates
          WHERE user_id = ${current.user_id} AND award_key = ${CAPSTONE_KEY}
            AND criteria_version = ${CAPSTONE_RUBRIC_VERSION}
        `;
    const credential = inserted ?? existingRows.at(0);
    if (!credential) throw new Error("credential insert returned no row");
    return { grade, credentialId: credential.id, repeated: false };
  });
}
