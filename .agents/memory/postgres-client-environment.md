---
name: PostgreSQL client environment safety
description: Avoid inherited workspace connection defaults when accessing an approved external database.
---

For an approved external PostgreSQL connection, construct the child process's
libpq environment from the parsed secret and remove inherited `PG*` defaults.
Keep credentials out of command arguments and tool output.

**Why:** Passing a URI through `PGDATABASE` in this workspace did not reliably
select the intended remote endpoint; inherited workspace defaults caused
misleading local-server TLS and database-name errors.

**How to apply:** Supply separate host, port, database, user, and password
environment fields with explicit certificate verification. Suppress raw client
errors because they can include connection credentials or private record data.
