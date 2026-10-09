-- Release announcements a learner has seen, so a dismissed "What's new" banner stays dismissed
-- on every device.
--
-- A set, like revealed hints: one row per (learner, release), so re-uploading a release is a
-- no-op and two devices seeing the same release write one row. The earliest time is kept.

CREATE TABLE seen_releases (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- A release tag, such as `v0.1.12`.
  release_version text NOT NULL CHECK (release_version ~ '^v[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$'),
  seen_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, release_version)
);
