import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {mkdir,readFile,writeFile} from "node:fs/promises";
const {Pool}=createRequire(new URL("../lib/db/package.json",import.meta.url))("pg");
const target=process.argv[2];
assert(["development","neon"].includes(target),"Choose development or neon explicitly");
const url=process.env[target==="neon"?"NEON_DATABASE_URL":"DATABASE_URL"];
assert(url,"Required database secret is missing");
const pool=new Pool({connectionString:url});
const tx=await pool.connect();
try {
  await tx.query("BEGIN");
  await tx.query("SET LOCAL lock_timeout='5s'");
  await tx.query("SET LOCAL statement_timeout='60s'");
  await tx.query("CREATE TABLE IF NOT EXISTS app_data_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  if((await tx.query("SELECT 1 FROM app_data_migrations WHERE name='lifting-groups'")).rowCount) {
    console.log("Lifting-group migration already applied; existing memberships left unchanged.");
  } else {
    const tables=(await tx.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'app_data_migrations' ORDER BY tablename")).rows.map(r=>r.tablename);
    const quote=s=>'"'+s.replaceAll('"','""')+'"';
    await tx.query(`LOCK TABLE ${tables.map(quote).join(",")} IN SHARE ROW EXCLUSIVE MODE`);
    const before={};
    for(const table of tables) before[table]=(await tx.query(`SELECT * FROM ${quote(table)}`)).rows;
    await mkdir("private-backups",{recursive:true,mode:0o700});
    await writeFile(`private-backups/${target}-before-lifting-groups-${Date.now()}.json`,JSON.stringify(before),{mode:0o600});
    await tx.query(await readFile(new URL("../lib/db/migrations/20261019_lifting_groups.sql",import.meta.url),"utf8"));
    for(const table of tables) {
      const after=(await tx.query(`SELECT * FROM ${quote(table)}`)).rows;
      assert.deepEqual(after.map(JSON.stringify).sort(),before[table].map(JSON.stringify).sort(),`Existing data changed in ${table}`);
    }
    const mapping=(await tx.query(`SELECT p.username,g.name FROM password_credentials p JOIN lifting_group_members m ON m.user_id=p.user_id JOIN lifting_groups g ON g.id=m.group_id WHERE p.username IN ('bhatta','danny','derek') ORDER BY p.username`)).rows;
    if(target==="neon") {
      for(const username of ["bhatta","danny","derek"]) assert(mapping.some(r=>r.username===username&&r.name==="smurf squad"),`Expected ${username} in smurf squad; rolling back without changing any old data`);
    }
    await tx.query("INSERT INTO app_data_migrations(name) VALUES('lifting-groups')");
    console.log({existingRecordsUnchanged:true,mapping});
  }
  await tx.query("COMMIT");
} catch(error) {await tx.query("ROLLBACK");throw error;}
finally {tx.release();await pool.end();}
