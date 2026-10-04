-- Accounts and their lesson completions. Applied by `pnpm db:migrate`; never edit a migration
-- after it has been applied anywhere: add a new numbered file instead.

CREATE TABLE users (
  -- Internal id. Everything else references this, never the provider's subject.
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The identity provider (its OIDC issuer). Subjects are only unique within one issuer.
  issuer text NOT NULL CHECK (issuer <> '' AND length(issuer) <= 512),
  -- The provider's stable OIDC `sub`. Opaque and case-sensitive.
  subject text NOT NULL CHECK (subject <> '' AND length(subject) <= 255),
  -- Profile details, refreshed from the provider. Never used to identify anyone.
  name text CHECK (length(name) <= 200),
  email text CHECK (length(email) <= 320),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_issuer_subject_key UNIQUE (issuer, subject)
);

CREATE TABLE lesson_completions (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- A lesson id from GitDojo's content catalog, validated by the server before insert.
  lesson_id text NOT NULL CHECK (lesson_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(lesson_id) <= 100),
  -- The lesson's type and course when it was first completed.
  lesson_type text NOT NULL CHECK (lesson_type IN ('concept', 'interactive', 'challenge')),
  course_id text,
  -- XP awarded by the server for this completion; a learner's total is the sum.
  xp integer NOT NULL CHECK (xp >= 0),
  -- The first completion. Repeated completions never change it.
  completed_at timestamptz NOT NULL DEFAULT now(),
  -- One completion per learner and lesson, so retries and concurrent requests cannot add XP twice.
  PRIMARY KEY (user_id, lesson_id)
);
