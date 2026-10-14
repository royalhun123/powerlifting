# Platform — Powerlifting Coach

A responsive coaching and workout tracker built around the user's supplied peaking workbook.

## Run & operate
- API: managed workflow `artifacts/api-server: API Server`
- Web: managed workflow `artifacts/platform: web`, preview `/`
- `pnpm run typecheck` — workspace typecheck
- `pnpm --filter @workspace/api-spec run codegen` — regenerate client hooks and validators after contract changes
- `pnpm --filter @workspace/db run push` — development schema updates
- Publish manages production schema changes; do not add startup DDL.

## Structure
- `lib/api-spec/openapi.yaml`: API contract
- `lib/db/src/schema/`: PostgreSQL/Drizzle tables and auth sessions
- `artifacts/api-server/src/routes/training.ts`: authorized training operations
- `artifacts/api-server/src/lib/analytics.ts`: completed-set aggregates and Epley estimates
- `artifacts/api-server/src/data/imported-programs.json`: extracted prescription templates
- `scripts/src/import-workbook.py`: source workbook extraction, including review warnings
- `artifacts/platform/src/pages/`: dashboard, workouts, programs, clients, progress, settings, invitations
- `lib/replit-auth-web`: OIDC browser login/logout

## Product and decisions
- Users train themselves and may coach explicitly linked athletes; there is no globally privileged coach role.
- Client invitations are single-use, seven-day shareable links. The app does not send email. Acceptance explicitly shares workout history with the coach.
- Every account receives editable workbook-derived template copies; completed history always starts empty. Assignments snapshot programs so later template edits do not rewrite prescribed work or historical logs.
- Anonymous preview data is synthetic and read-only, never actual client records.
- Workout/session units are stored with each log; analytics convert to viewer units. Volume means completed external load × reps, excluding bodyweight.
- Estimated maxes use Epley only on competition-classified sets of 1–10 reps. Actual weight records and estimates are distinct.
- Source weight and notes cells are references, not evidence that sets were completed. Review flags identify uncertain Excel date conversions. Verify reference maxes/units before using percentage prescriptions.

## Verification limitations
Initial build was typechecked and checked with public API requests and a preview screenshot. Signed-in browser flows require an actual sign-in and were not browser-verified.
