-- Everything a learner's progress holds besides completions, so it reaches their other devices.
--
-- Counters are stored per device and summed per account. A device always uploads its own
-- absolute totals, so a retry after a network failure writes the same row again and can never
-- double count, while another device's row is left alone.

CREATE TABLE command_stats (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Which browser profile reported these; opaque to the server.
  device_id text NOT NULL CHECK (length(device_id) BETWEEN 1 AND 100),
  -- A Git subcommand as typed after `git`, e.g. `commit` or `cherry-pick`.
  command text NOT NULL CHECK (command ~ '^[a-z][a-z-]{0,31}$'),
  uses integer NOT NULL CHECK (uses >= 0),
  successes integer NOT NULL CHECK (successes >= 0 AND successes <= uses),
  last_used_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, device_id, command)
);

CREATE TABLE device_activity (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id text NOT NULL CHECK (length(device_id) BETWEEN 1 AND 100),
  playground_sessions integer NOT NULL DEFAULT 0 CHECK (playground_sessions >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

-- Hints merge as a set: a hint revealed on any device stays recorded, and re-uploading it is a
-- no-op, so there is no per-device row and nothing to double count.
CREATE TABLE revealed_hints (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- `lesson:<id>` or `challenge:<id>`.
  content_key text NOT NULL CHECK (content_key ~ '^(lesson|challenge):[a-z0-9]+(-[a-z0-9]+)*$'),
  -- `<objective id>#<hint index>`.
  hint text NOT NULL CHECK (hint ~ '^[a-z0-9]+(-[a-z0-9]+)*#[0-9]{1,3}$'),
  revealed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_key, hint)
);

-- One row per learner: the most recent visit from any device wins.
CREATE TABLE last_lessons (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  course_id text NOT NULL CHECK (course_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(course_id) <= 100),
  lesson_id text NOT NULL CHECK (lesson_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(lesson_id) <= 100),
  visited_at timestamptz NOT NULL
);
