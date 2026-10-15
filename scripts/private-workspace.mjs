import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const preserved = ["users","password_credentials","training_profiles","training_programs","training_assignments","training_sessions","training_bodyweights","training_true_maxes","coaching_links","coaching_invitations","app_coaches","app_administration"];
async function fingerprints(tx) {
  const result = new Map();
  for (const table of preserved) {
    result.set(table, (await tx.query(`SELECT md5(row_to_json(t)::text) AS hash FROM ${table} t ORDER BY 1`)).rows.map(r=>r.hash));
  }
  return result;
}
async function verifyUnchanged(tx, before, allowedAdds = {}) {
  const after = await fingerprints(tx);
  for (const [table, hashes] of before) {
    const remaining = [...after.get(table)];
    for (const hash of hashes) {
      const index=remaining.indexOf(hash);
      assert.notEqual(index,-1,`Pre-existing record changed: ${table}`);
      remaining.splice(index,1);
    }
    assert.equal(remaining.length,allowedAdds[table] ?? 0,`Unexpected additions: ${table}`);
  }
}

/** Explicit external-Postgres migration only; never invoked by app/build. */
export async function migrateWorkspaces(pool) {
  const tx=await pool.connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SET LOCAL lock_timeout='5s'");
    await tx.query("SET LOCAL statement_timeout='30s'");
    await tx.query(`LOCK TABLE ${preserved.join(",")} IN SHARE ROW EXCLUSIVE MODE`);
    const before=await fingerprints(tx);
    await tx.query(await readFile(new URL("../lib/db/migrations/20261017_private_workspaces.sql",import.meta.url),"utf8"));
    await verifyUnchanged(tx,before);
    await tx.query("COMMIT");
    return {existingRecordsUnchanged:true};
  } catch(error) {await tx.query("ROLLBACK");throw error;}
  finally {tx.release();}
}

/** Creates a NEW isolated workspace/admin. Never resets or reassigns an account. */
export async function createPrivateAdmin(pool,{workspaceId,workspaceName,username,name}) {
  assert.match(workspaceId,/^[a-z][a-z0-9-]{2,63}$/);
  assert.match(username,/^[a-z0-9][a-z0-9._-]{2,31}$/);
  assert.notEqual(workspaceId,"team");
  const userId=randomUUID(),token=randomBytes(32).toString("base64url");
  const expiresAt=new Date(Date.now()+24*60*60*1000);
  const tx=await pool.connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SET LOCAL lock_timeout='5s'");
    await tx.query("SET LOCAL statement_timeout='30s'");
    await tx.query(`LOCK TABLE ${preserved.join(",")},app_workspaces,app_workspace_members IN SHARE ROW EXCLUSIVE MODE`);
    const before=await fingerprints(tx);
    assert.equal((await tx.query("SELECT 1 FROM password_credentials WHERE username=$1",[username])).rowCount,0,"Username already exists; no account will be overwritten.");
    assert.equal((await tx.query("SELECT 1 FROM app_workspaces WHERE id=$1",[workspaceId])).rowCount,0,"Workspace already exists.");
    await tx.query("INSERT INTO app_workspaces(id,name) VALUES($1,$2)",[workspaceId,workspaceName]);
    await tx.query("INSERT INTO users(id,first_name) VALUES($1,$2)",[userId,name]);
    await tx.query("INSERT INTO app_workspace_members(user_id,workspace_id) VALUES($1,$2)",[userId,workspaceId]);
    await tx.query("INSERT INTO app_administration(id,user_id) VALUES($1,$2)",[workspaceId,userId]);
    await tx.query("INSERT INTO training_profiles(user_id,data) VALUES($1,$2)",[userId,JSON.stringify({id:userId,name,unit:"lb",meetDate:"",squatMax:0,benchMax:0,deadliftMax:0,coachName:""})]);
    await tx.query("INSERT INTO password_credentials(user_id,username) VALUES($1,$2)",[userId,username]);
    await tx.query("INSERT INTO password_setups(user_id,token_hash,expires_at) VALUES($1,$2,$3)",[userId,createHash("sha256").update(token).digest("hex"),expiresAt]);
    await verifyUnchanged(tx,before,{users:1,password_credentials:1,training_profiles:1,app_administration:1});
    await tx.query("COMMIT");
    return {userId,username,workspaceId,path:`/set-password#token=${token}`,expiresAt:expiresAt.toISOString(),existingRecordsUnchanged:true};
  } catch(error) {await tx.query("ROLLBACK");throw error;}
  finally {tx.release();}
}
