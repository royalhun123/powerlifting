-- Additive migration for the external Neon production database.
-- Back up the correct database before applying. Does not modify existing data.
BEGIN;
CREATE TABLE IF NOT EXISTS password_credentials (
  user_id text PRIMARY KEY REFERENCES users(id),
  username text NOT NULL UNIQUE,
  password_hash text,
  version integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS password_setups (
  user_id text PRIMARY KEY REFERENCES users(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_limits_expiry_idx ON auth_rate_limits(expires_at);
COMMIT;
