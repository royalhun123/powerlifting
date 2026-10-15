-- No existing rows are modified by this schema migration.
CREATE TABLE IF NOT EXISTS app_administration (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id)
);
