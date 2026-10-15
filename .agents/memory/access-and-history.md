---
name: Access and history expectations
description: Client access goal and rules for historical measurements.
---

Signed-out visitors should land on login, not a demo dashboard.

**Why:** The user considers the app operational and explicitly removed public demo browsing.

**How to apply:** Keep onboarding and password-setup links accessible without signing in; do not restore demo navigation or redirect already-signed-in users away from their normal home.

The user now wants coach-assigned usernames, single-use links to choose passwords, and subsequent username/password login for both coach and clients.

**Why:** Auth0 was not allowed; after using private links for the initial Vercel migration, they explicitly approved replacing normal sign-in with username/password.

**How to apply:** Preserve existing user IDs and training history. Keep legacy access until password setup succeeds, then retire its reusable links and prior sessions. Back up before any external production schema migration.

The Vercel migration must also move data hosting off Replit.

**Why:** The user needs the app to remain available after access to this Replit account ends.

**How to apply:** Treat connecting Vercel to the Replit production database as temporary, not the final solution. Back up production data and verify an independent PostgreSQL destination and account access before retiring the source.

The user subsequently chose to start the Neon database from scratch for a new training block rather than transfer old history.

**Why:** The user explicitly said they would redo the database and asked for coach access.

**How to apply:** Allow initialization of a fresh Neon database and coach account without requiring the old-data migration first. This does not authorize deleting the original Replit database.

Treat Vercel with the new Neon database as the live app, not the older Replit deployment.

**Why:** The user confirmed the fresh Neon database and Vercel coach access are working.

**How to apply:** Continue source changes through GitHub; distinguish Replit preview data from Neon live data. Handle production schema changes explicitly against the external database, not through Replit publishing.

Do not populate a form field with a private key taken from a sign-in URL fragment.

**Why:** Browser automation can expose the value of even a masked password input in its accessibility output. This was observed with a subsequently revoked test-only link.

**How to apply:** Strip the fragment immediately, retain it only in transient component state, and show a confirmation button rather than a populated input. Never screenshot or log a real newly issued link.

Handle credential fragments on same-route hash navigation as well as initial mount.

**Why:** Browser testing found that opening another setup link while already on the setup route did not remount the component, leaving the fragment visible and stale validation state.

**How to apply:** Listen for hash changes, strip each incoming fragment, and revalidate each visit without rendering the token.

The original coach is coach-only after team administration is handed to a separate team-owned admin account. The admin can add coaches, but must not remove coaches. Coaches manage their own clients; the admin may see the directory but cannot edit those clients or manage established coaches' passwords.

**Why:** Team administration must pass to successors while the original coach can keep using the app after leaving the team. The user explicitly requested independent rosters, read-only administrative oversight, and no coach removal.

**How to apply:** Keep authority server-controlled. Preserve the original coach ID and records during handoff; do not change the original coach environment ID to the team admin. Never infer roles from usernames, grant them through profile edits, or link new coaches as managed clients of the admin.

Navigation order is Dashboard, Workouts, My blocks, Progress, My clients, Programs, Settings. My clients and Programs are coach-only. My blocks contains personal assignments for coaches and clients; Programs is shared only within the current workspace. Only the uploader may edit/rename/delete a template; other coaches in that workspace can make independently owned copies.

**Why:** Coaches should share programming without controlling each other's work or changing already logged client training. The user later explicitly required private coaching to be isolated from the team.

**How to apply:** Preserve original ownership and stable user IDs, show uploader attribution, and retain assignment snapshots. The user subsequently removed spreadsheet uploading; do not restore it without a new request.

The team admin can inspect every coach's uploaded programs, current blocks, and actual workout history, including their clients' logs, but cannot edit, copy, assign, archive or remove them.

**Why:** The user describes this as the team president's account for tracking and monitoring everyone's progress while retaining the no-edit/no-removal boundary.

**How to apply:** Expose prescriptions and actual logged sets/notes through separate read-only admin views, including historical sessions even if their block was archived or removed. Do not broaden coach or client mutation permissions.

Admin coach details combine programs and history into three sections: Uploaded programs, Coach's blocks, and Client's blocks. Client's blocks uses client-switching tabs; each person's workout history belongs under the relevant block, including archived and removed blocks.

**Why:** The user wants one coherent team-president view, rather than separate Programs and History entry points.

**How to apply:** Keep old logs visible even when their block no longer exists, and never add admin edit or reply controls.

Workout conversations support coach/client replies about the whole workout, an exercise, or an individual set. Admin can read but not participate. Video uploads were explicitly dropped.

**Why:** Clients should be able to tell exactly which part of a workout a coach commented on without expanding the admin's permissions.

**How to apply:** Preserve existing feedback and discussion history when training logs are edited; keep the original comment target understandable if a logged exercise changes later.

Clients can archive and restore their assigned programs, but only the assigning coach can remove them. Keep workout history and progress after removal.

**Why:** The user requested coach control over client programs, client-only archiving, and preservation of their saved edits.

**How to apply:** Remove an assignment from active and archived lists without deleting its historical sessions or the original template. Archiving is per athlete, not a change to the shared template.

Historical bodyweight entries without a recorded time must remain “time not recorded,” not be assigned morning/day/night.

**Why:** Time-of-day tracking was added after existing daily logs, so assigning a period would invent measurement metadata.

**How to apply:** Preserve unspecified periods during schema changes; new entries must select a real period.

Adding a column to a composite primary key in one Drizzle push can generate changes in the wrong order in this workspace.

**Why:** A push attempted to alter the new column before it existed.

**How to apply:** For development schema changes, add the column with a safe default before updating the composite key when this ordering error occurs. Production schema changes must use the supported publishing process.
