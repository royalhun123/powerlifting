// Development only. Real HTTP authorization checks, isolated disposable records.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
if(process.env.TEST_MULTI_COACH!=="development" || process.env.VERCEL) throw new Error("Set TEST_MULTI_COACH=development outside Vercel.");
const {Pool}=createRequire(new URL("../lib/db/package.json",import.meta.url))("pg");
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
const admin=`multi-test-${randomUUID()}`, ids=[admin], usernames=[];
const password=randomBytes(24).toString("base64url"), ip=`198.19.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}`;
const digest=s=>createHash("sha256").update(s).digest("hex");
process.env.COACH_USER_ID=admin;
process.env.AUTH_MODE="private-link";
process.env.NODE_ENV="production";
const {default:app}=await import("../artifacts/api-server/dist/app.mjs");
const server=app.listen(0,"127.0.0.1");
await new Promise(resolve=>server.once("listening",resolve));
const base=`http://127.0.0.1:${server.address().port}/api`;
async function request(path,body,cookie,method=body?"POST":"GET") {
  const response=await fetch(base+path,{method,headers:{"Content-Type":"application/json","x-forwarded-for":ip,...cookie?{cookie}:{}},...body?{body:JSON.stringify(body)}:{}});
  const data=await response.json();
  return {status:response.status,data,cookie:response.headers.getSetCookie().filter(c=>c.startsWith("sid=")).at(-1)?.split(";")[0]};
}
const username=()=>{const name=`multi_${randomBytes(6).toString("hex")}`;usernames.push(name);return name;};
const token=setup=>new URLSearchParams(setup.data.path.split("#")[1]).get("token");
async function create(path,adminCookie,name) {
  const setup=await request(path,{name,username:username()},adminCookie);
  assert.equal(setup.status,200,JSON.stringify(setup.data));ids.push(setup.data.userId);
  const signed=await request("/auth/password-setup",{token:token(setup),password});
  assert.equal(signed.status,200);
  return {id:setup.data.userId,username:setup.data.username,cookie:signed.cookie};
}
async function historicalFingerprint(id) {
  const result={};
  for(const table of ["training_assignments","training_sessions","training_bodyweights","training_true_maxes"]) {
    result[table]=(await pool.query(`SELECT md5(coalesce(string_agg(row_to_json(t)::text, '|' ORDER BY row_to_json(t)::text),'')) AS hash FROM ${table} t WHERE athlete_id=$1`,[id])).rows[0].hash;
  }
  return result;
}
try {
  await pool.query("INSERT INTO users(id,first_name) VALUES($1,'TEST ADMIN')",[admin]);
  const sid=randomBytes(32).toString("hex"), link=randomUUID();
  await pool.query("INSERT INTO coaching_invitations(id,coach_id,name,token,accepted_by,expires_at) VALUES($1,$2,'TEST',$3,$2,now()+interval '1 hour')",[link,admin,"private:"+digest(randomUUID())]);
  await pool.query("INSERT INTO sessions(sid,sess,expire) VALUES($1,$2,now()+interval '1 hour')",[sid,JSON.stringify({provider:"private-link",privateLinkId:link,access_token:"",user:{id:admin,email:null,firstName:"TEST ADMIN",lastName:null,profileImageUrl:null}})]);
  const adminCookie=`sid=${sid}`;
  const a=await create("/coaches",adminCookie,"TEST COACH A"), b=await create("/coaches",adminCookie,"TEST COACH B");
  const clientA=await create("/password-accounts",a.cookie,"TEST CLIENT A"), clientB=await create("/password-accounts",b.cookie,"TEST CLIENT B");
  const own=await create("/password-accounts",adminCookie,"TEST ADMIN CLIENT");
  const wa=(await request("/workspace",null,a.cookie)).data, wb=(await request("/workspace",null,b.cookie)).data;
  assert.equal(wa.isCoach,true);assert.equal(wa.isAdmin,false);
  assert.deepEqual(wa.athletes.map(a=>a.id),[clientA.id]);assert.deepEqual(wb.athletes.map(a=>a.id),[clientB.id]);
  const waAdmin=(await request("/workspace",null,adminCookie)).data;
  assert.equal(waAdmin.isAdmin,true);assert.deepEqual(waAdmin.athletes.map(a=>a.id),[own.id]);
  assert.equal((await request("/coaches",null,a.cookie)).status,403);
  assert.equal((await request("/coaches",{name:"BAD",username:username()},a.cookie)).status,403);
  assert.equal((await request("/coaches",{userId:a.id,username:a.username},adminCookie)).status,403);
  const directory=await request("/coaches",null,adminCookie);
  assert.equal(directory.status,200);
  assert.deepEqual(directory.data.find(c=>c.userId===a.id).clients.map(c=>c.id),[clientA.id]);
  const program={name:"TEST shared program",description:"",phase:"peak",weeks:1,archived:false,workouts:[{id:randomUUID(),name:"Squat day",week:1,day:1,exercises:[{id:randomUUID(),name:"Comp squat",sets:"1",reps:"1",effort:"RPE 9",weight:"",notes:"",review:false,lift:"squat"}]}]};
  const saved=await request("/programs",program,a.cookie);assert.equal(saved.status,200);
  const p=saved.data;
  for(const cookie of [adminCookie,b.cookie]) {
    const shared=(await request("/workspace",null,cookie)).data.programs.find(x=>x.id===p.id);
    assert.equal(shared.uploaderId,a.id);assert.equal(shared.uploaderName,"TEST COACH A");
    assert.equal((await request("/programs",{...p,name:"unauthorized"},cookie)).status,404);
    assert.equal((await request(`/programs/${p.id}`,null,cookie,"DELETE")).status,404);
  }
  assert.equal((await request("/programs",program,clientA.cookie)).status,403);
  const assigned=await request("/assignments",{programId:p.id,athleteId:clientA.id,startDate:"2026-10-15"},a.cookie);
  assert.equal(assigned.status,200);
  const assignment=assigned.data;
  const session={assignmentId:assignment.id,workoutId:p.workouts[0].id,name:"Squat day",date:"2026-10-15",unit:"lb",status:"completed",notes:"preserve",sets:[{exerciseId:p.workouts[0].exercises[0].id,exerciseName:"Comp squat",lift:"squat",setNumber:1,weight:315,reps:1,rpe:9,completed:true,notes:"preserve"}]};
  const logged=await request("/sessions",session,clientA.cookie);assert.equal(logged.status,200);
  assert.equal((await request("/bodyweights",{date:"2026-10-15",weight:180,unit:"lb",timeOfDay:"morning"},clientA.cookie)).status,200);
  assert.equal((await request("/maxes",{date:"2026-10-15",lift:"squat",weight:325,unit:"lb"},clientA.cookie)).status,200);
  const before=await historicalFingerprint(clientA.id);
  for(const cookie of [adminCookie,b.cookie]) {
    assert.equal((await request("/assignments",{programId:p.id,athleteId:clientA.id,startDate:"2026-10-15"},cookie)).status,403);
    assert.equal((await request(`/assignments/${assignment.id}`,null,cookie,"DELETE")).status,403);
    assert.equal((await request(`/sessions/${logged.data.id}/feedback`,{feedback:"unauthorized"},cookie,"PATCH")).status,403);
    assert.equal((await request("/sessions",{...session,id:logged.data.id},cookie)).status,403);
    assert.equal((await request("/password-accounts",{userId:clientA.id,username:clientA.username},cookie)).status,403);
    assert.equal((await request(`/password-accounts/${clientA.id}/setup`,null,cookie,"DELETE")).status,403);
    assert.equal((await request("/access-links",{userId:clientA.id},cookie)).status,403);
    assert.equal((await request(`/analytics?athleteId=${clientA.id}`,null,cookie)).status,403);
    assert.equal((await request(`/sessions/${logged.data.id}`,null,cookie,"DELETE")).status,404);
  }
  const copied=await request("/programs",{...program,name:"Independent copy",uploaderId:a.id},b.cookie);
  assert.equal(copied.status,200);assert.equal(copied.data.uploaderId,b.id);
  assert.equal((await request("/programs",{...copied.data,name:"Edited copy"},b.cookie)).status,200);
  assert.equal((await request("/programs",{...p,name:"Renamed original"},a.cookie)).status,200);
  assert.equal((await request("/assignments",{programId:p.id,athleteId:clientB.id,startDate:"2026-10-15"},b.cookie)).status,200);
  assert.equal((await request(`/programs/${p.id}`,null,a.cookie,"DELETE")).status,200);
  assert.deepEqual(await historicalFingerprint(clientA.id),before);
  const clientWorkspace=(await request("/workspace",null,clientA.cookie)).data;
  assert.equal(clientWorkspace.programs.length,0);
  assert.equal(clientWorkspace.assignments[0].program.name,"TEST shared program");
  assert.equal(clientWorkspace.sessions[0].sets[0].weight,315);
  console.log("PASS: admin onboarding; independent coaches/clients; global library; uploader-only changes; copy ownership; cross-coach mutation and credential denial; assignment/session/1RM/bodyweight fingerprints unchanged after template rename/delete.");
} finally {
  for(const table of ["training_sessions","training_assignments","training_bodyweights","training_true_maxes"]) await pool.query(`DELETE FROM ${table} WHERE athlete_id=ANY($1::text[])`,[ids]);
  for(const table of ["password_setups","password_credentials","training_profiles"]) await pool.query(`DELETE FROM ${table} WHERE user_id=ANY($1::text[])`,[ids]);
  await pool.query("DELETE FROM sessions WHERE sess->'user'->>'id'=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM coaching_invitations WHERE coach_id=ANY($1::text[]) OR accepted_by=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM coaching_links WHERE coach_id=ANY($1::text[]) OR athlete_id=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM training_programs WHERE owner_id=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM app_coaches WHERE user_id=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::text[])",[ids]);
  const keys=["setup-ip","setup-info-ip"].map(scope=>digest(`${scope}:${ip}`));
  await pool.query("DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])",[keys]);
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pool.end();
}
