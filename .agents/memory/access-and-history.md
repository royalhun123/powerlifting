---
name: Access and history expectations
description: Client access goal and rules for historical measurements.
---

The user wants clients to access training using any email provider after receiving an invitation, without needing a Replit account.

**Why:** The user explicitly chose invite-only email sign-in.

**How to apply:** Preserve this as the access goal. Do not claim it is implemented merely because coaching invitations exist; verify the actual authentication provider and account-preservation path first.

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
