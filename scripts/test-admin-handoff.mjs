import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID, randomBytes } from "node:crypto";
import { handoffAdmin } from "./admin-handoff.mjs";
import { hashPassword } from "../artifacts/api-server/src/lib/password-crypto.ts";
if(process.env.TEST_ADMIN_HANDOFF!=="development" || process.env.VERCEL) throw new Error("Development confirmation required.");
const {Pool}=createRequire(new URL("../lib/db/package.json",import.meta.url))("pg");
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const coachId=`handoff-coach-${randomUUID()}`,adminId=`handoff-admin-${randomUUID()}`, ids=[coachId,adminId];
const password=randomBytes(24).toString("base64url");
process.env.COACH_USER_ID=coachId;process.env.AUTH_MODE="private-link";process.env.NODE_ENV="production";
const {default:app}=await import("../artifacts/api-server/dist/app.mjs");
const server=app.listen(0,"127.0.0.1");
await new Promise(r=>server.once("listening",r));
const base=`http://127.0.0.1:${server.address().port}/api`;
async function request(path,body,cookie,method=body?"POST":"GET"){
  const r=await fetch(base+path,{method,headers:{"Content-Type":"application/json","x-forwarded-for":"198.18.12.27",...cookie?{cookie}:{}},...body?{body:JSON.stringify(body)}:{}});
  const text=await r.text();
  return {status:r.status,data:text.startsWith("{")||text.startsWith("[")?JSON.parse(text):null,cookie:r.headers.getSetCookie().filter(c=>c.startsWith("sid=")).at(-1)?.split(";")[0]};
}
try {
  assert.equal((await pool.query("SELECT count(*)::int n FROM app_administration")).rows[0].n,0,"Do not overwrite configured development admin.");
  await pool.query("INSERT INTO users(id,first_name) VALUES($1,'TEST HANDOFF COACH')",[coachId]);
  const hash=await hashPassword(password);
  await pool.query("INSERT INTO password_credentials(user_id,username,password_hash,version) VALUES($1,$2,$3,1)",[coachId,coachId,hash]);
  assert.deepEqual(await handoffAdmin(pool,{coachId,adminId,passwordHash:hash}),{existingRecordsUnchanged:true});
  const admin=await request("/auth/password-login",{username:"admin",password});assert.equal(admin.status,200);
  const coach=await request("/auth/password-login",{username:coachId,password});assert.equal(coach.status,200);
  const aw=(await request("/workspace",null,admin.cookie)).data, cw=(await request("/workspace",null,coach.cookie)).data;
  assert.equal(aw.isAdmin,true);assert.equal(aw.isCoach,false);
  assert.equal(cw.isAdmin,false);assert.equal(cw.isCoach,true);
  assert.equal((await request("/coaches",null,coach.cookie)).status,403);
  const directory=await request("/coaches",null,admin.cookie);assert.equal(directory.status,200);
  assert.ok(directory.data.some(c=>c.userId===coachId));
  assert.equal((await request("/password-accounts",{name:"Forbidden client",username:"forbidden_client"},admin.cookie)).status,403);
  assert.equal((await request("/password-accounts",{userId:coachId,username:"valid_coach_username"},admin.cookie)).status,403);
  assert.equal((await request(`/coaches/${coachId}`,null,admin.cookie,"DELETE")).status,404);
  assert.equal((await request("/workspace",null,coach.cookie)).data.isCoach,true);
  console.log("PASS: independent admin login, original coach retained, no coach removal or admin client/password control.");
} finally {
  await pool.query("DELETE FROM app_administration WHERE user_id=$1",[adminId]);
  await pool.query("DELETE FROM app_coaches WHERE user_id=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM sessions WHERE sess->'user'->>'id'=ANY($1::text[])",[ids]);
  for(const table of ["password_credentials","password_setups","training_profiles"]) await pool.query(`DELETE FROM ${table} WHERE user_id=ANY($1::text[])`,[ids]);
  await pool.query("DELETE FROM training_programs WHERE owner_id=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM app_workspace_members WHERE user_id=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::text[])",[ids]);
  server.closeAllConnections();await new Promise(r=>server.close(r));await pool.end();
}
