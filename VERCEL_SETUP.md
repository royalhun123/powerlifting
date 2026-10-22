# Navy Powerlifting: Vercel migration

For the username/password upgrade, follow **PASSWORD_LOGIN_SETUP.md** first.
Its additive Neon migration must run before deploying the new authentication
code. The private-link instructions below describe the initial migration and
remain valid only for accounts that have not completed password setup.


## Backup verification — 2026-10-22 UTC

The supplied `SOURCE_PRODUCTION_DATABASE_URL` was reachable using PostgreSQL
client settings `sslmode=verify-full` and the system CA bundle. Public-table
counts matched the managed production read-only query, not a development copy.
This verifies workspace connectivity, not yet Vercel runtime connectivity.

A full custom-format archive was created in the private, Git/deployment-excluded
`private-backups/20261022T005400Z/` directory. It was successfully restored to an
isolated temporary local PostgreSQL instance. A refreshed archive at
`private-backups/20261022T014350Z/` was then restored to the separately approved
backup database, with every table count matching:

| Table | Source before/after and restored count |
| --- | ---: |
| users | 2 |
| training_profiles | 2 |
| training_programs | 4 |
| training_assignments | 4 |
| training_sessions | 3 |
| training_bodyweights | 0 |
| training_true_maxes | 6 |
| coaching_links | 1 |
| coaching_invitations | 1 |
| sessions | 2 |

Each private directory contains the archive and its SHA-256 verification manifest.
The local recovery test database was removed afterward. The remote backup restore
completed in one transaction. All public-table row contents matched production
(compared privately using deterministic fingerprints), not only their counts.
This includes original user IDs, coach relationships, invitation records, sessions,
and training history. Source records were unchanged during verification.

**Approved plan:** keep the existing production database for Vercel. The owner
approved restoring a backup to `BACKUP_DATABASE_URL`, then explicitly approved
preserving its existing Neon Auth tables and adding the training backup alongside
them. Neon Auth table contents were verified unchanged before and after restore.

**Completed:** the refreshed production snapshot is retained in the separate
database identified by `BACKUP_DATABASE_URL`; its connection and recovery were
verified with certificate verification enabled. Keep that database and its secret.
It is a point-in-time backup, not a continuously synchronized replica, and must
not be used as Vercel's live database. It is now populated: do not overwrite it.
Private local archives are deliberately excluded from merges and publishing;
the retained remote database is the backup handoff.

For Vercel's production `DATABASE_URL`, use the existing production connection
supplied in `SOURCE_PRODUCTION_DATABASE_URL`, securely copied through provider
settings, never chat or Git. Workspace connectivity is verified; configuring
Vercel, verifying its runtime connection, and coach/client sign-in remain separate.
No production connection settings were changed and the current site was not retired.
Do not perform another restore merely because destination secrets exist. Obtain
explicit approval and refuse to overwrite existing data without authorization.

To create another private archive, use `python3 scripts/production-backup.py`.
It reads only the dedicated production source secret and does not perform a
remote restore. A new archive still needs a recovery test and durable retention.
Refresh the backup after production private-link records are created.

## What is ready

The root `vercel.json` builds the frontend and one bundled Express function.
Use repository root (`.`), **Other** framework, Node 22 or 24, and the commands
from that file. Do not set the Vercel root directory to `artifacts/api-server`.
The API is prebundled to JavaScript so Vercel need not compile workspace
TypeScript project references itself.

This does not publish anything or move any database.

## Preserve live data first

Your GitHub repository does NOT contain the production database.
Back up the production database, not development. Retain all tables, including
`users`, `training_profiles`, `training_assignments`, `training_sessions`,
`coaching_links`, `coaching_invitations`, bodyweights, maxes, and sessions.
Preserve all IDs. Do not reseed an empty database or recreate existing clients.
Confirm the backup and destination before transferring data.

Vercel requires a reachable PostgreSQL connection. If the current production
database cannot accept external connections, choose an external PostgreSQL
destination and restore the production backup there. This is a separate,
explicitly approved data migration. Do not use the development DATABASE_URL.
Use the database provider's pooled connection URL and required TLS settings;
do not disable certificate verification.

## Create private access before switching

1. Run/publish this update on the current host while Replit login is still enabled.
2. Sign in as the existing coach. In **Settings → Private sign-in links**, create
   a link for **My coach account** and save it privately.
3. For existing clients select **existing client**, not **Create a new client**.
   This preserves their original IDs and history.
4. Links are shown only once. The database stores a hash, not the raw key.
   Links expire after 180 days. Remembered sessions last at most 30 days.
5. Take/refresh the production backup AFTER creating these links if transferring
   databases, so the link records are included.

## Set Vercel environment variables (never put these in GitHub)

- `DATABASE_URL`: the approved **production** PostgreSQL connection.
- `AUTH_MODE`: `private-link`.
- `COACH_USER_ID`: the original coach's `users.id`, exactly unchanged from the
  source database. The old `COACH_REPLIT_USER_ID` is also supported during migration.
  This is an account ID, NOT the display name “bhatta” or an email.
  Find it under Settings → Private sign-in links → Vercel coach account setting.
- Optional `COACH_SETUP_KEY`: an independently generated random secret with at
  least 32 characters, stored in a password manager. This enables coach recovery
  from `/sign-in`; it still requires the original coach user to exist in the DB.
  Disable/remove this variable after setup if you do not want recovery enabled.

No Auth0, Replit OAuth, email service, or external identity-provider credentials
are required on Vercel. Never grant coach access based on a typed username.

Configure these under Vercel Project Settings → Environment Variables. Use a
separate test database for Preview deployments; do not expose production data
to arbitrary preview builds. Never paste credentials into chat or commit them.

## Deploy and verify before cutover

Push the updated code to GitHub, import/redeploy the repository on Vercel, and
check the build and runtime logs. Vercel reads the root configuration.

Open the saved private coach link with ONLY its origin changed to your Vercel
domain: preserve the `/sign-in#key=...` portion exactly. No key belongs in a
public URL posted to chat. After sign-in, create fresh client links on the new
domain. Revoking a link invalidates the sessions issued through it on the next
request without removing workouts.

Verify coach access, client access, old program/session/bodyweight/max counts,
a test session save/reload, and link revocation on Vercel before retiring the
old site. Keep the old site and backup until these checks pass. Avoid writing
new data to two different databases during cutover.

`AUTH_MODE` defaults to the old Replit flow outside Vercel to let the owner
create migration links safely. Vercel always disables Replit OAuth. Do not
change the current host to private-link mode until your coach link is saved.

## Security model

Private links are reusable bearer keys. Anyone you share a link with can access
that account. There is no email verification and no username/password fallback.
Revoking a client link does not delete their account/history. Create a replacement
link for the same existing account. Never use public demo links as real keys.
