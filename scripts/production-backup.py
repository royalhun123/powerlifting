"""Read-only production backup. Credentials stay in child-process environments.

Usage: python3 scripts/production-backup.py
Private output is excluded from Git and deployment. Copy it to approved durable
storage before considering the backup retained across workspace/task cleanup.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.parse


def main():
    source = os.environ.get("SOURCE_PRODUCTION_DATABASE_URL", "").strip()
    if not source:
        raise RuntimeError("Missing production source secret")
    parsed = urllib.parse.urlsplit(source)
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname:
        raise RuntimeError("Invalid production source connection format")
    env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    env.update(
        PGHOST=parsed.hostname,
        PGPORT=str(parsed.port or 5432),
        PGDATABASE=urllib.parse.unquote(parsed.path.lstrip("/")),
        PGUSER=urllib.parse.unquote(parsed.username or ""),
        PGPASSWORD=urllib.parse.unquote(parsed.password or ""),
        PGSSLMODE="verify-full",
        PGSSLROOTCERT="/etc/ssl/certs/ca-certificates.crt",
        PGCONNECT_TIMEOUT="20",
        PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=120000",
    )

    def run(args):
        result = subprocess.run(args, env=env, capture_output=True, text=True)
        if result.returncode:
            # Driver errors can contain credentials, names, or record contents.
            raise RuntimeError(f"{args[0]} failed; private diagnostics suppressed")
        return result.stdout.strip()

    def query(sql):
        return run(["psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", sql])

    tables = json.loads(query("""
        SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables
        WHERE schemaname = 'public'
    """))
    if not tables or not {"users", "training_sessions", "training_assignments"}.issubset(tables):
        raise RuntimeError("Source does not contain expected training tables")
    if any(not name.replace("_", "").isalnum() for name in tables):
        raise RuntimeError("Unexpected table identifier")

    def counts():
        return {name: int(query(f'SELECT count(*) FROM public."{name}"')) for name in tables}

    before = counts()
    os.umask(0o077)
    folder = Path("private-backups") / datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    folder.mkdir(parents=True, mode=0o700)
    dump = folder / "production.dump"
    run(["pg_dump", "--format=custom", "--file", str(dump)])
    run(["pg_restore", "--list", str(dump)])
    # Parse every archive block without exposing the SQL or any private rows.
    run(["pg_restore", "--file=/dev/null", str(dump)])
    after = counts()
    manifest = {
        "source": "SOURCE_PRODUCTION_DATABASE_URL",
        "created_utc": folder.name,
        "sha256": hashlib.file_digest(dump.open("rb"), "sha256").hexdigest(),
        "bytes": dump.stat().st_size,
        "counts_before": before,
        "counts_after": after,
        "counts_stable": before == after,
        "archive_readable": True,
        "restore_tested": False,
        "durable_retention_confirmed": False,
    }
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"backup_folder": str(folder), **manifest}, indent=2))
    if before != after:
        raise RuntimeError("Source changed during backup; reconcile before any cutover")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Backup not confirmed ({type(error).__name__}); no destination was modified.")
        raise SystemExit(1)
