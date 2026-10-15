# Navy Powerlifting: Vercel migration

For the username/password upgrade, follow **PASSWORD_LOGIN_SETUP.md** first.
Its additive Neon migration must run before deploying the new authentication
code. The private-link instructions below describe the initial migration and
remain valid only for accounts that have not completed password setup.

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
