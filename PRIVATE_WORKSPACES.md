# Private workspaces

Existing accounts without explicit membership remain in `team`. Existing training
rows, user IDs, ownership and snapshots are not moved or rewritten.

Each new coach and client inherits the creator's workspace atomically. Each
workspace has its own administrator, coach directory and shared program library.
Global usernames remain unique. Use separate usernames for separate personas;
there is no account switching or transfer across workspaces.

The personal `ahan` account is admin-only. After its password setup, use Coaches
to invite a separate personal coach persona, then sign into that coach account
to add friends and manage their training. Team `bhatta` and `admin` stay unchanged.

## Deployment order

For external Neon only, explicitly apply
`lib/db/migrations/20261017_private_workspaces.sql` before deploying the new code.
`scripts/private-workspace.mjs` exports an explicit preservation-checked migration
and new-admin provisioning function; neither runs during builds or app startup.
Do not run provisioning again against an existing username.

The production migration and account provisioning were applied during this
upgrade. A private logical JSON backup and password-setup instructions are under
`private-backups/` and `private-setup/`, excluded from Git and deployment.
The setup link expires after 24 hours and is usable once; the app requires a
password of at least 12 characters. Never commit or publicly share that link.

Do not deploy or roll back to the older globally shared-library code after
private coaching begins: older versions do not enforce workspace isolation.
Missing workspace tables fail closed rather than silently bypassing isolation.

Coaches can read their linked clients' bodyweight logs in My clients. They cannot
edit or delete those entries. Existing personal weight-entry controls are unchanged.
