# Independent coaches and shared programs

For the separate team-admin account and the original coach's continued access, follow `ADMIN_HANDOFF.md`. It supersedes the initial combined owner/admin role described below.

## Safe rollout

1. Keep a Neon backup branch containing current data.
2. On the original live Neon database, apply `lib/db/migrations/20261016_multi_coach.sql` before deploying the new code. It only adds an empty `app_coaches` table; it does not update existing users, credentials, programs, assignments, workouts, 1RMs or bodyweights.
   - Alternatively, when the external `NEON_DATABASE_URL` secret is configured in this workspace, run `CONFIRM_MULTI_COACH_MIGRATION=yes node scripts/migrate-multi-coach.mjs`.
   - This script checks the original `navy-coach` account, locks existing tables briefly, and compares row counts and full-record fingerprints before committing. It is not a build or startup script.
3. Push the code to GitHub and deploy on Vercel. Keep `DATABASE_URL`, `COACH_USER_ID=navy-coach` and existing authentication variables unchanged.
4. Sign in as the existing coach. The same account is now the sole administrator as well as a coach. No new account or password is required.

## Admin and coaches

- **Coaches** is admin-only. Create a coach with a name and unique username, then send the one-time setup link privately. The coach chooses their own password.
- Pending initial invitations may be renewed. Once a coach sets a password, the admin cannot reset their password, change their roster, or edit their clients.
- The directory exposes coach and client names/counts only. Client progress, records, assignments and account management stay with their own coach.
- Every coach, including the admin, manages their own roster through **Clients**.

## Programs

- **My programs** is the global library for coaches. It remains personal assigned programs for clients.
- **My training** holds a coach's personal assignments.
- Only a template's uploader can rename, edit, archive, or delete it. Other coaches can view it, assign a snapshot to their own clients, or copy it and edit their new owned copy.
- Existing templates retain their original owner. Old assignments remain independent snapshots; renaming/deleting the library template never rewrites historical assignments or logs.
- **Import .xlsx** reads the workbook locally, previews sheets, and saves only selected prescription programs. The file itself is not stored.
- Supported layouts: original week blocks with repeated Exercise / Sets / Reps / Effort headers, or a table with Week, Day, Exercise, Sets, Reps (optional Workout, Effort, Notes and Lift).
- File limit: 10 MB, 30 sheets, 5,000 rows/200 columns per sheet. Rep-range dates become ranges; old recorded weight cells are ignored. No completed workouts, maxes or bodyweights are imported.

## Development verification

- `pnpm run typecheck`
- `pnpm --filter @workspace/api-server run build`
- `TEST_MULTI_COACH=development node scripts/test-multi-coach.mjs`
- The test writes unique fixtures only to the development database and removes them afterward. It checks role separation, cross-coach mutation denial, copy ownership, and unchanged historical-record fingerprints.
