---
name: Team and private coaching isolation
description: The user's team and non-team coaching must remain mutually private
---

Team and personal coaching are separate workspaces. Neither admin can see the
other workspace's programs, coaches, clients, logs, bodyweights or conversations.
Each workspace has its own admin and shared lifter library. Separate personas
use separate usernames; no account or data transfer is implied.

**Why:** The user explicitly chose a separate private workspace for coaching
friends who are not on the team, rather than merely a separate coach roster.

**How to apply:** Keep all pre-existing accounts and training in the team
workspace. Inherit membership atomically when creating any coach or client,
including legacy invitation paths. Scope reads AND writes, not just navigation.
Missing workspace schema must fail closed. Do not roll back to older globally
shared-library code after private data exists. Preserve original user IDs,
training records, password hashes and assignment snapshots during migrations.

Current group leaders may read their members' bodyweight logs but cannot edit or
delete them.

**Why:** The user requested coach visibility into clients' bodyweight history,
not authority to alter measurements.
