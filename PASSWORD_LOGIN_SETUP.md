# Username/password rollout on Vercel + Neon

## Important: migrate the database before deploying this code

The change adds three authentication tables. It does not reset or rewrite any
users, programs, assignments, workout sessions, bodyweight entries, or maxes.
Live Neon is separate from the Replit development database. Never assume a
Replit Publish or a GitHub push migrates Neon.

1. In Neon, choose the branch used by the live Vercel app. Under **Branches →
   New branch**, create `before-password-login` from that branch, including
   **Current data** (not schema only). Disable automatic deletion until rollout
   is verified. This copy includes schema and current data; keep it private and
   check Neon plan/storage allowances. Do not change Vercel's connection string
   to the backup branch.
2. In Neon SQL Editor, select the ORIGINAL live branch and database. Run the
   complete SQL in `lib/db/migrations/20261015_password_auth.sql`. It creates
   three tables and one index, in a transaction; no old records are modified.
   Do not run a broad force-push or a restore over the live database.
3. Commit/push the code to GitHub, then allow/approve the Vercel deployment.
   Keep DATABASE_URL, AUTH_MODE=private-link, and COACH_USER_ID unchanged.
   AUTH_MODE retains its existing name; it means app-owned auth instead of
   Replit OAuth, and now includes passwords.
4. Open the live app using your existing coach private link, or use the configured
   COACH_SETUP_KEY under **Sign in → Coach setup or recovery**.
5. In **Settings → Password accounts**, choose **My coach account**, assign a
   username, and create a setup link. Open the link, choose a password, then
   sign out and verify username/password login. Your original user ID remains.
6. In **Clients → Password accounts**, select each EXISTING client to convert
   without duplicates, or **Create a new client** for a new athlete. Assign a
   unique username, generate the link, and send it privately. There is no email
   service; the coach shares the link.
7. Verify workout history, one new saved entry, client restrictions, and reset
   behavior on the live site before retiring the backup branch. Keep a private
   recovery strategy. Removing COACH_SETUP_KEY from Vercel and redeploying
   disables the host-owner recovery route; configure it again only if needed.

## Behavior

- Usernames: case-insensitive, 3–32 letters/numbers/periods/underscores/hyphens,
  beginning with a letter or number. Once assigned, the UI does not rename them.
- Passwords: 12–128 characters, salted scrypt hashes only; never readable by coach.
- Setup/reset links: random 256-bit tokens stored only as hashes, expire in
  24 hours, atomically consumed once. Visiting/previewing a link does not consume
  it. Reloading the stripped URL loses its in-memory token; reopening the
  original unconsumed link works.
- Generating a new link replaces the previous pending one. Cancelling a link
  leaves the existing password and sessions unchanged.
- Completing setup/reset invalidates ALL previous sessions and reusable
  private links for that user, then starts a new password session. It preserves
  the user's account ID and all training records.
- After conversion, neither Replit login nor reusable private links can bypass
  that account's password. Host-owner COACH_SETUP_KEY remains an explicit,
  server-configured recovery credential, rate-limited independently.
- Password sessions use secure HTTP-only SameSite=Lax cookies, expire after
  30 days, and validate the credential version on every request.
- Login attempt counters are stored in PostgreSQL across serverless instances:
  10 attempts per normalized username and 50 per IP in a 15-minute window.
  Setup/recovery routes have independent limits. Never trust a client-side role.

## Verification in development

```sh
pnpm run typecheck
node --experimental-strip-types --test artifacts/api-server/src/lib/password-crypto.test.mjs
pnpm --filter @workspace/api-server run build
TEST_PASSWORD_AUTH=development node scripts/test-password-auth.mjs
```

The integration script creates and deletes ONLY its own development fixtures.
It checks coach/client login, case-insensitivity, duplicate rollback, concurrent
single-use redemption, replaced/cancelled/expired links, password reset,
retirement of legacy links, session invalidation, and persistent throttling.
Do not point it at the live Neon database.

Neon may use a newer PostgreSQL major version than Replit's installed pg_dump.
A portable pg_dump backup requires a client at least as new as the server.
The Neon branch-copy step above avoids relying on an incompatible local client.
