// Explicit, one-time EXTERNAL Neon migration. Never run during app startup/build.
// Run after creating a backup branch:
// CONFIRM_MULTI_COACH_MIGRATION=yes node scripts/migrate-multi-coach.mjs
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
if(process.env.CONFIRM_MULTI_COACH_MIGRATION!=="yes" || !process.env.NEON_DATABASE_URL) {
  throw new Error("Explicit confirmation and the external NEON_DATABASE_URL secret are required.");
}
const {Pool}=createRequire(new URL("../lib/db/package.json",import.meta.url))("pg");
const pool=new Pool({connectionString:process.env.NEON_DATABASE_URL,max:1});
const client=await pool.connect();
const quote=s=>'"'+s.replaceAll('"','""')+'"';
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SET LOCAL statement_timeout='20s'");
  const owner=await client.query("SELECT EXISTS(SELECT 1 FROM users WHERE id=$1) AS present",["navy-coach"]);
  assert.equal(owner.rows[0].present,true,"Expected existing live coach is missing; refusing migration.");
  const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
  await client.query(`LOCK TABLE ${tables.map(t=>`public.${quote(t)}`).join(",")} IN SHARE MODE`);
  const snapshot=async()=>{
    const state={};
    for(const table of tables) {
      const result=await client.query(`SELECT count(*)::int AS count, md5(coalesce(string_agg(row_to_json(t)::text, '|' ORDER BY row_to_json(t)::text),'')) AS fingerprint FROM public.${quote(table)} t`);
      state[table]=result.rows[0];
    }
    return state;
  };
  const before=await snapshot();
  await client.query(await readFile(new URL("../lib/db/migrations/20261016_multi_coach.sql",import.meta.url),"utf8"));
  const columns=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='app_coaches' ORDER BY ordinal_position")).rows.map(r=>r.column_name);
  assert.deepEqual(columns,["user_id","created_by","created_at"]);
  assert.deepEqual(await snapshot(),before,"Existing data changed; transaction will roll back.");
  await client.query("COMMIT");
  console.log(`SUCCESS: additive coach table ready. All ${tables.length} existing tables retain identical row counts and record fingerprints.`);
} catch(error) {
  await client.query("ROLLBACK").catch(()=>{});
  // Avoid leaking connection strings or credentials in connection-error details.
  console.error("Migration rolled back or did not run. Error code:",error?.code || error?.name || "unknown");
  process.exitCode=1;
} finally {client.release();await pool.end();}
