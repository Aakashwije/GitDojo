import "server-only";

import { getDatabase } from "@/lib/db/client";
import type { VerifiedIdentity } from "@/lib/auth/identity";
import { upsertUser } from "@/lib/account-progress/postgres-store";
import { AWARDS, criteriaNarrative, type AwardKey } from "./awards";

export interface Certificate {
  id: string;
  statusIndex: number;
  userId: string;
  awardKey: AwardKey;
  criteriaVersion: number;
  recipientName: string;
  publicNameConsent: boolean;
  issuedAt: Date;
  revokedAt: Date | null;
  evidence: {
    title: string;
    description: string;
    template: string;
    criteria: string;
    lessons: string[];
    practice: string[];
  };
}

interface Row {
  id: string;
  status_index: string;
  user_id: string;
  award_key: AwardKey;
  criteria_version: number;
  recipient_name: string;
  public_name_consent: boolean;
  issued_at: Date;
  revoked_at: Date | null;
  evidence: Certificate["evidence"];
}

function certificate(row: Row): Certificate {
  return {
    id: row.id, statusIndex: Number(row.status_index), userId: row.user_id,
    awardKey: row.award_key, criteriaVersion: row.criteria_version,
    recipientName: row.recipient_name, publicNameConsent: row.public_name_consent,
    issuedAt: row.issued_at, revokedAt: row.revoked_at, evidence: row.evidence,
  };
}

export async function findCertificate(id: string): Promise<Certificate | null> {
  const [row] = await getDatabase()<Row[]>`
    SELECT * FROM certificates WHERE id = ${id}
  `;
  return row ? certificate(row) : null;
}

export async function ownCertificates(identity: VerifiedIdentity): Promise<Certificate[]> {
  const rows = await getDatabase()<Row[]>`
    SELECT c.* FROM certificates c JOIN users u ON u.id = c.user_id
    WHERE u.issuer = ${identity.issuer} AND u.subject = ${identity.subject}
    ORDER BY c.issued_at DESC
  `;
  return rows.map(certificate);
}

export async function ownCertificate(identity: VerifiedIdentity, id: string): Promise<Certificate | null> {
  const [row] = await getDatabase()<Row[]>`
    SELECT c.* FROM certificates c JOIN users u ON u.id = c.user_id
    WHERE c.id = ${id} AND u.issuer = ${identity.issuer} AND u.subject = ${identity.subject}
  `;
  return row ? certificate(row) : null;
}

export async function issueCertificate(
  identity: VerifiedIdentity,
  key: AwardKey,
  recipientName: string,
  publicNameConsent: boolean,
): Promise<
  | { certificate: Certificate; eligible: true; missing: string[] }
  | { certificate: null; eligible: false; missing: string[] }
> {
  const sql = getDatabase();
  const award = AWARDS[key];
  return sql.begin(async (tx) => {
    const userId = await upsertUser(tx, identity);
    const [prior] = await tx<Row[]>`
      SELECT * FROM certificates
      WHERE user_id = ${userId} AND award_key = ${key}
        AND criteria_version = ${award.criteriaVersion}
    `;
    if (prior) return { certificate: certificate(prior), eligible: true, missing: [] };

    const lessons = await tx<{ lesson_id: string }[]>`
      SELECT lesson_id FROM lesson_completions WHERE user_id = ${userId}
    `;
    const practice = await tx<{ task_id: string }[]>`
      SELECT task_id FROM practice_completions WHERE user_id = ${userId}
    `;
    const doneLessons = new Set(lessons.map((item) => item.lesson_id));
    const donePractice = new Set(practice.map((item) => item.task_id));
    const missing = [
      ...award.lessons.filter((id) => !doneLessons.has(id)).map((id) => `lesson:${id}`),
      ...award.practice.filter((id) => !donePractice.has(id)).map((id) => `practice:${id}`),
    ];
    if (missing.length > 0) return { certificate: null, eligible: false, missing };

    const evidence = {
      title: award.title,
      description: award.description,
      template: award.template,
      criteria: criteriaNarrative(key),
      lessons: [...award.lessons],
      practice: [...award.practice],
    };
    const [inserted] = await tx<Row[]>`
      INSERT INTO certificates (
        user_id, award_key, criteria_version, recipient_name,
        public_name_consent, evidence
      ) VALUES (
        ${userId}, ${key}, ${award.criteriaVersion}, ${recipientName},
        ${publicNameConsent}, ${JSON.stringify(evidence)}::jsonb
      )
      ON CONFLICT (user_id, award_key, criteria_version) DO NOTHING
      RETURNING *
    `;
    const [row] = inserted ? [inserted] : await tx<Row[]>`
      SELECT * FROM certificates
      WHERE user_id = ${userId} AND award_key = ${key}
        AND criteria_version = ${award.criteriaVersion}
    `;
    return { certificate: certificate(row), eligible: true, missing: [] };
  });
}

export async function revokedIndexes(batch: number): Promise<number[]> {
  const start = batch * 131072 + 1;
  const end = start + 131072;
  const rows = await getDatabase()<{ status_index: string }[]>`
    SELECT status_index FROM certificates
    WHERE status_index >= ${start} AND status_index < ${end} AND revoked_at IS NOT NULL
  `;
  return rows.map((row) => (Number(row.status_index) - 1) % 131072);
}
