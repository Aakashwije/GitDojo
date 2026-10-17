CREATE TABLE assessment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assessment_key text NOT NULL,
  rubric_version integer NOT NULL CHECK (rubric_version > 0),
  nonce text NOT NULL CHECK (length(nonce) BETWEEN 20 AND 200),
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'passed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  result jsonb,
  evidence jsonb
);

CREATE INDEX assessment_attempts_user_started
  ON assessment_attempts (user_id, started_at DESC);

ALTER TABLE certificates
  ADD COLUMN credential_kind text NOT NULL DEFAULT 'completion'
    CHECK (credential_kind IN ('completion', 'assessed')),
  ADD COLUMN assessment_attempt_id uuid UNIQUE REFERENCES assessment_attempts(id) ON DELETE RESTRICT;
