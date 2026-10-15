# Lifting groups

All non-admin accounts are lifters. Group leadership is an additional permission,
not an account tier. Every lifter can use the shared library in their own workspace,
create/copy programs, and assign programs to themselves. Template editing remains
restricted to its owner.

Public signup is available from the login page without an invitation. It always
creates an independent lifter in the team workspace, never an administrator or
a member of the private personal workspace. New registrants can access the
team's shared program library; personal-workspace access remains invite-only.

A lifter belongs to at most one group, including a group they lead. Members may
leave; a leader leaves by explicitly deleting the group after confirmation.
Leaders can also remove individual members after a warning and confirmation;
removed members become independent and retain all their training data.
Deletion removes membership and outstanding group invitations, never training
records. Members can still run their existing blocks afterward. Only the current
leader may review members or assign them programs. Comments remain attached to
the original workout, including after membership changes.

Workspace admins can invite independent lifters and inspect all lifters, groups,
programs, blocks, logs, comments and measurements in their own workspace. They
cannot edit training or group membership. Team and personal workspaces remain
mutually private.

## Deployment and preservation

The explicit migration command is:

```
node scripts/migrate-lifting-groups.mjs development
node scripts/migrate-lifting-groups.mjs neon
```

Both databases have already been migrated for this release. A migration marker
prevents reruns from recreating groups that users later delete. Never run the raw
SQL repeatedly. Builds and app startup do not run data migrations.

The migration writes a private logical row snapshot under `private-backups/`
(excluded from Git/deployment), inserts group metadata, and checks that every
pre-existing row is unchanged. It is not a native PostgreSQL schema dump.
The live migration confirmed bhatta, danny and derek in **smurf squad** and
preserved their original assignments and training records.

Push the source changes to GitHub and wait for Vercel deployment. Avoid using
old coach/client invitation flows between migration and deployment. Do not roll
back to the former coach/client permissions once group membership changes have
been made: those versions use obsolete access metadata.

The legacy coach/client column and route names retained internally are compatibility
details, not the source of current group leadership. Do not infer new permissions
from old historical assignment authors or account-invitation rows.

## Verification

`NODE_ENV=development TEST_LIFTING_GROUPS=development node scripts/test-lifting-groups.mjs`
is the development-only group regression suite.
It supersedes the old multi-coach role assumptions in
`scripts/test-multi-coach.mjs`. It uses disposable users/workspaces and verifies
training fingerprints across leaving/deleting groups.
