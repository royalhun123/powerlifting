-- Additive only: no updates or deletes to existing users or training history.
CREATE TABLE IF NOT EXISTS app_coaches (
  user_id text PRIMARY KEY REFERENCES users(id),
  created_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
