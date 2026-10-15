---
name: Access and history expectations
description: Client access goal and rules for historical measurements.
---

The user chose private sign-in links instead of external-provider or username-only login for the Vercel migration. Clients should not need a Replit account or a password.

**Why:** Auth0 was not allowed for them; they accepted private links after being informed that username-only access permits impersonation.

**How to apply:** Treat links as bearer credentials; hash stored tokens, allow revocation of links and sessions, and keep existing user IDs when migrating history. Do not replace or move the live database without confirming the backup and transfer.

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

Only the app owner is the coach and may see All programs and Clients. Everyone, including the owner, gets My programs containing only their personal assignments.

**Why:** The owner needs to write programs for clients without adding them to their own training, and clients must not manage the shared program library.

**How to apply:** Keep coach authority server-controlled and separate templates from assignments; never let a profile edit or first-time signup grant coach access.

Clients can archive and restore their assigned programs, but only the assigning coach can remove them. Keep workout history and progress after removal.

**Why:** The user requested coach control over client programs, client-only archiving, and preservation of their saved edits.

**How to apply:** Remove an assignment from active and archived lists without deleting its historical sessions or the original template. Archiving is per athlete, not a change to the shared template.

Historical bodyweight entries without a recorded time must remain “time not recorded,” not be assigned morning/day/night.

**Why:** Time-of-day tracking was added after existing daily logs, so assigning a period would invent measurement metadata.

**How to apply:** Preserve unspecified periods during schema changes; new entries must select a real period.

Adding a column to a composite primary key in one Drizzle push can generate changes in the wrong order in this workspace.

**Why:** A push attempted to alter the new column before it existed.

**How to apply:** For development schema changes, add the column with a safe default before updating the composite key when this ordering error occurs. Production schema changes must use the supported publishing process.
