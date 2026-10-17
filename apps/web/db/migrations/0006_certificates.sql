-- GitDojo completion certificates. The unique award key makes issuance safe under retries.
CREATE TABLE certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status_index bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  award_key text NOT NULL,
  criteria_version integer NOT NULL CHECK (criteria_version > 0),
  recipient_name text NOT NULL CHECK (length(recipient_name) BETWEEN 1 AND 200),
  public_name_consent boolean NOT NULL DEFAULT false,
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  evidence jsonb NOT NULL,
  CONSTRAINT certificates_one_award UNIQUE (user_id, award_key, criteria_version)
);

CREATE INDEX certificates_user_issued ON certificates (user_id, issued_at DESC);

-- Public keys remain available after a signing key is rotated.
CREATE TABLE certificate_signing_keys (
  key_id text PRIMARY KEY CHECK (key_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  public_jwk jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
