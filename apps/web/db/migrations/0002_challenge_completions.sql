-- Standalone challenges are distinct from lessons, even when their ids match.
CREATE TABLE challenge_completions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL CHECK (challenge_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(challenge_id) <= 100),
  xp integer NOT NULL CHECK (xp >= 0),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, challenge_id)
);
