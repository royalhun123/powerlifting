-- Explicit additive migration. Do not run automatically at startup or build.
-- Legacy users without a membership remain in the team workspace.
CREATE TABLE IF NOT EXISTS app_workspaces (
  id text PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS app_workspace_members (
  user_id text PRIMARY KEY REFERENCES users(id),
  workspace_id text NOT NULL REFERENCES app_workspaces(id)
);
CREATE INDEX IF NOT EXISTS workspace_members_workspace_idx ON app_workspace_members(workspace_id);
INSERT INTO app_workspaces(id,name) VALUES ('team','Navy Powerlifting team') ON CONFLICT(id) DO NOTHING;
