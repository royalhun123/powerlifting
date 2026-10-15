CREATE TABLE IF NOT EXISTS lifting_groups (
  id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES app_workspaces(id),
  leader_id text NOT NULL UNIQUE REFERENCES users(id), name text NOT NULL
);
CREATE TABLE IF NOT EXISTS lifting_group_members (
  user_id text PRIMARY KEY REFERENCES users(id),
  group_id text NOT NULL REFERENCES lifting_groups(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS lifting_group_invites (
  token_hash text PRIMARY KEY,
  group_id text NOT NULL REFERENCES lifting_groups(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, used_by text REFERENCES users(id)
);
-- Migration is deliberately one-time. Never repopulate deleted groups at startup.
INSERT INTO lifting_groups(id,workspace_id,leader_id,name)
SELECT 'legacy-group-'||c.user_id,coalesce(m.workspace_id,'team'),c.user_id,
CASE WHEN p.username='bhatta' THEN 'smurf squad'
ELSE coalesce(nullif(t.data->>'name',''),'Lifter')||'''s lifting group' END
FROM app_coaches c
LEFT JOIN app_workspace_members m ON m.user_id=c.user_id
LEFT JOIN password_credentials p ON p.user_id=c.user_id
LEFT JOIN training_profiles t ON t.user_id=c.user_id
WHERE NOT EXISTS(SELECT 1 FROM app_administration a WHERE a.user_id=c.user_id);
INSERT INTO lifting_group_members(user_id,group_id)
SELECT leader_id,id FROM lifting_groups;
-- Conflicting legacy memberships fail the transaction rather than pick a leader.
INSERT INTO lifting_group_members(user_id,group_id)
SELECT l.athlete_id,g.id FROM coaching_links l
JOIN lifting_groups g ON g.leader_id=l.coach_id
LEFT JOIN app_workspace_members m ON m.user_id=l.athlete_id
WHERE l.athlete_id<>g.leader_id AND coalesce(m.workspace_id,'team')=g.workspace_id
AND NOT EXISTS(SELECT 1 FROM app_administration a WHERE a.user_id=l.athlete_id);
