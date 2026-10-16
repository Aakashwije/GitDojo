-- Practice mode tasks are a namespace of their own, apart from lessons and challenges, and are
-- never worth XP: the table has no xp column, so nothing here can ever add to an account's XP.
CREATE TABLE practice_completions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id text NOT NULL CHECK (task_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(task_id) <= 100),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);
