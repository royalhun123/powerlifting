import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/** Explicit migration only. Never invoked by builds or server startup.
 * Password hashes are passed in memory; plaintext credentials are never saved.
 */
export async function handoffAdmin(pool, {coachId, adminId, passwordHash}) {
  const tx=await pool.connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SET LOCAL lock_timeout='3s'");
    await tx.query("SET LOCAL statement_timeout='20s'");
    const owner=await tx.query("SELECT id FROM users WHERE id=$1",[coachId]);
    assert.equal(owner.rowCount,1,"Original coach must exist.");
    await tx.query(await readFile(new URL("../lib/db/migrations/20261016_admin_handoff.sql",import.meta.url),"utf8"));
    const tables=["users","password_credentials","training_profiles","training_programs","training_assignments","training_sessions","training_bodyweights","training_true_maxes","coaching_links","coaching_invitations","app_coaches","app_administration"];
    await tx.query(`LOCK TABLE ${tables.join(",")} IN SHARE ROW EXCLUSIVE MODE`);
    const existing=await tx.query("SELECT user_id FROM app_administration WHERE id='team'");
    assert.equal(existing.rowCount,0,"Handoff already configured; never reset an existing administrator.");
    assert.equal((await tx.query("SELECT id FROM users WHERE id=$1",[adminId])).rowCount,0,"Admin ID already exists.");
    assert.equal((await tx.query("SELECT user_id FROM password_credentials WHERE username='admin'")).rowCount,0,"Admin username already exists.");
    // Save fingerprints for all pre-existing records, comparing those same
    // records after additions. No old record may change, disappear or move.
    const before=new Map();
    for(const table of tables) {
      const rows=(await tx.query(`SELECT md5(row_to_json(t)::text) AS hash FROM ${table} t ORDER BY 1`)).rows.map(r=>r.hash);
      before.set(table,rows);
    }
    await tx.query("INSERT INTO users(id,first_name) VALUES($1,'admin')",[adminId]);
    await tx.query("INSERT INTO training_profiles(user_id,data) VALUES($1,$2)",[adminId,JSON.stringify({id:adminId,name:"admin",unit:"lb",meetDate:"",squatMax:0,benchMax:0,deadliftMax:0,coachName:""})]);
    await tx.query("INSERT INTO password_credentials(user_id,username,password_hash,version) VALUES($1,'admin',$2,1)",[adminId,passwordHash]);
    await tx.query("INSERT INTO app_coaches(user_id,created_by) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING",[coachId,adminId]);
    await tx.query("INSERT INTO app_administration(id,user_id) VALUES('team',$1)",[adminId]);
    const allowedAdds={users:1,password_credentials:1,training_profiles:1,app_coaches:1,app_administration:1};
    for(const table of tables) {
      const rows=(await tx.query(`SELECT md5(row_to_json(t)::text) AS hash FROM ${table} t ORDER BY 1`)).rows.map(r=>r.hash);
      const remaining=[...rows];
      for(const hash of before.get(table)) {
        const at=remaining.indexOf(hash);
        assert.notEqual(at,-1,`Existing record changed in ${table}`);
        remaining.splice(at,1);
      }
      assert.ok(remaining.length<=(allowedAdds[table]||0),`Unexpected additions to ${table}`);
    }
    await tx.query("COMMIT");
    return {existingRecordsUnchanged:true};
  } catch(e) {await tx.query("ROLLBACK");throw e;}
  finally {tx.release();}
}
