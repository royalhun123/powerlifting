# Team-owned administration

The team admin is separate from coaching accounts. The admin username is `admin`.
The password is not stored in source code or this guide; only its scrypt hash is in the account database.

## Roles

- The admin can onboard coaches and see the coach/client-name directory.
- There is no coach-removal endpoint or control.
- The admin cannot manage existing coaches' passwords or their clients.
- The original coach keeps their original account, clients, programs and lifting history, including after leaving the team.
- The admin sees Coaches and Settings, not training pages.
- The admin can change their own password through Settings by generating and redeeming a setup link.

## Deployment

The external Neon handoff has been applied. Deploy the updated code from GitHub to activate the new roles.
Keep the existing Vercel `COACH_USER_ID` pointing to the original coach; do not replace it with the team admin.
No new environment variables are needed.

For another environment, apply `lib/db/migrations/20261016_admin_handoff.sql`, then use the explicit `handoffAdmin` helper in `scripts/admin-handoff.mjs` with the original coach ID, a new admin ID and an in-memory password hash. Do not put plaintext passwords in files or build commands.
The helper refuses to overwrite existing admin accounts and verifies that all existing records in the affected account/training tables are unchanged.
Never invoke the handoff automatically at startup or during deployment builds.

## Read-only program oversight

The admin's Coaches directory includes each coach's uploaded programs, personal active blocks, and their clients' active blocks. Expand a program to inspect its prescribed workouts. No edit, copy, assign, archive or removal controls are available to the admin.

Spreadsheet uploading has been removed. Previously saved programs and all training history remain intact.

True 1RM backfill is under **Settings → Prior lifting history**. Enter the date the lift actually occurred.
