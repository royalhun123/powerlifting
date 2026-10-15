// Development only. Real HTTP authorization checks, isolated disposable records.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createPrivateAdmin } from "./private-workspace.mjs";
if(process.env.TEST_MULTI_COACH!=="development" || process.env.VERCEL) throw new Error("Set TEST_MULTI_COACH=development outside Vercel.");
const {Pool}=createRequire(new URL("../lib/db/package.json",import.meta.url))("pg");
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
const admin=`multi-test-${randomUUID()}`, ids=[admin], usernames=[], workspaceIds=[];
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
  const selfClients=[];
  for (const [path,inviter] of [["/coaches",adminCookie],["/password-accounts",a.cookie]]) {
    const invite=await request(path,{},inviter);
    assert.equal(invite.status,200);ids.push(invite.data.userId);
    if(path==="/password-accounts") selfClients.push(invite.data.userId);
    assert.equal(invite.data.username,"");
    const setupToken=token(invite);
    const info=await request("/auth/password-setup-info",{token:setupToken});
    assert.equal(info.data.chooseUsername,true);
    const duplicate=await request("/auth/password-setup",{token:setupToken,password,username:a.username.toUpperCase()});
    assert.equal(duplicate.status,409);
    assert.equal((await request("/auth/password-setup-info",{token:setupToken})).status,200);
    const chosen=username();
    const redeemed=await request("/auth/password-setup",{token:setupToken,password,username:chosen,name:"Self chosen name"});
    assert.equal(redeemed.status,200);
    const workspace=(await request("/workspace",null,redeemed.cookie)).data;
    assert.equal(workspace.profile.name,"Self chosen name");
    assert.equal(workspace.isCoach,path==="/coaches");
    assert.equal(workspace.workspaceId,"team");
    assert.equal((await request("/auth/password-setup",{token:setupToken,password,username:chosen})).status,410);
  }
  const wa=(await request("/workspace",null,a.cookie)).data, wb=(await request("/workspace",null,b.cookie)).data;
  assert.equal(wa.isCoach,true);assert.equal(wa.isAdmin,false);
  assert.deepEqual(wa.athletes.map(a=>a.id).sort(),[clientA.id,...selfClients].sort());assert.deepEqual(wb.athletes.map(a=>a.id),[clientB.id]);
  const waAdmin=(await request("/workspace",null,adminCookie)).data;
  assert.equal(waAdmin.isAdmin,true);assert.deepEqual(waAdmin.athletes.map(a=>a.id),[own.id]);
  assert.equal((await request("/coaches",null,a.cookie)).status,403);
  assert.equal((await request("/coaches",{name:"BAD",username:username()},a.cookie)).status,403);
  assert.equal((await request("/coaches",{userId:a.id,username:a.username},adminCookie)).status,403);
  const directory=await request("/coaches",null,adminCookie);
  assert.equal(directory.status,200);
  assert.deepEqual(directory.data.find(c=>c.userId===a.id).clients.map(c=>c.id).sort(),[clientA.id,...selfClients].sort());
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
  const oversight=(await request("/coaches",null,adminCookie)).data.find(c=>c.userId===a.id);
  assert.equal(oversight.programs.find(x=>x.id===p.id).workouts[0].exercises[0].reps,"1");
  assert.equal(oversight.clients.find(c=>c.id===clientA.id).blocks[0].id,assignment.id);
  assert.equal(oversight.clients.find(c=>c.id===clientA.id).blocks[0].program.name,p.name);
  assert.equal(oversight.clients.some(c=>c.id===clientB.id),false);
  const session={assignmentId:assignment.id,workoutId:p.workouts[0].id,name:"Squat day",date:"2026-10-15",unit:"lb",status:"completed",notes:"preserve",sets:[{exerciseId:p.workouts[0].exercises[0].id,exerciseName:"Comp squat",lift:"squat",setNumber:1,weight:315,reps:1,rpe:9,completed:true,notes:"preserve"}]};
  const logged=await request("/sessions",session,clientA.cookie);assert.equal(logged.status,200);
  const historyPath=`/coaches/athletes/${clientA.id}/sessions`;
  const history=await request(historyPath,null,adminCookie);
  assert.equal(history.status,200);
  assert.deepEqual(history.data,[logged.data]);
  for (const cookie of [a.cookie,b.cookie,clientA.cookie,clientB.cookie]) {
    assert.equal((await request(historyPath,null,cookie)).status,403);
  }
  assert.equal((await request("/coaches/athletes/not-in-directory/sessions",null,adminCookie)).status,404);
  assert.deepEqual((await request(`/coaches/athletes/${clientB.id}/sessions`,null,adminCookie)).data,[]);
  const ownAssignment=await request("/assignments",{programId:p.id,athleteId:a.id,startDate:"2026-10-15"},a.cookie);
  assert.equal(ownAssignment.status,200);
  const ownLog=await request("/sessions",{...session,assignmentId:ownAssignment.data.id,status:"draft"},a.cookie);
  assert.equal(ownLog.status,200);
  assert.deepEqual((await request(`/coaches/athletes/${a.id}/sessions`,null,adminCookie)).data,[ownLog.data]);
  const discussionPath=`/sessions/${logged.data.id}/discussion`;
  assert.equal((await request(discussionPath)).status,401);
  assert.equal((await request(discussionPath,null,b.cookie)).status,403);
  assert.equal((await request(discussionPath,null,clientB.cookie)).status,403);
  const target={scope:"set",exerciseId:session.sets[0].exerciseId,setNumber:1,text:"Keep your upper back tight.",clientMessageId:randomUUID()};
  const started=await request(discussionPath,{...target,authorId:admin,authorName:"forged"},a.cookie);
  assert.equal(started.status,200);
  const thread=started.data.threads[0];
  assert.equal(thread.label,"Comp squat · Set 1");
  assert.equal(thread.messages[0].authorId,a.id);
  assert.equal(thread.messages[0].authorRole,"coach");
  assert.equal((await request(discussionPath,target,a.cookie)).data.threads.length,1);
  const repliesPath=`${discussionPath}/${thread.id}/replies`;
  const replies=await Promise.all([
    request(repliesPath,{text:"Should I brace before unracking?",clientMessageId:randomUUID()},clientA.cookie),
    request(repliesPath,{text:"Yes, then reset your breath at the top.",clientMessageId:randomUUID()},a.cookie),
  ]);
  assert.ok(replies.every(r=>r.status===200));
  const conversation=(await request(discussionPath,null,clientA.cookie)).data;
  assert.equal(conversation.threads[0].messages.length,3);
  assert.equal(conversation.threads[0].messages.filter(m=>m.authorRole==="athlete").length,1);
  assert.equal((await request(discussionPath,null,adminCookie)).data.canPost,false);
  assert.equal((await request(repliesPath,{text:"No admin replies",clientMessageId:randomUUID()},adminCookie)).status,403);
  assert.equal((await request(discussionPath,target,adminCookie)).status,403);
  assert.equal((await request(repliesPath,{text:"   ",clientMessageId:randomUUID()},clientA.cookie)).status,400);
  assert.equal((await request(discussionPath,{...target,setNumber:99,clientMessageId:randomUUID()},a.cookie)).status,400);
  assert.equal((await request(`${discussionPath}/not-a-thread/replies`,{text:"No",clientMessageId:randomUUID()},clientA.cookie)).status,404);
  assert.equal((await request(discussionPath,{...target,text:"Changed retry"},a.cookie)).status,409);
  for (const scope of ["workout","exercise"]) {
    const posted=await request(discussionPath,{scope,...scope==="exercise"?{exerciseId:session.sets[0].exerciseId}:{},text:`About the ${scope}`,clientMessageId:randomUUID()},clientA.cookie);
    assert.equal(posted.status,200);
  }
  // A stale session form must not replace newer comments.
  const edited=await request("/sessions",{...session,id:logged.data.id,discussions:[]},clientA.cookie);
  assert.equal(edited.status,200);
  assert.deepEqual(edited.data.sets,logged.data.sets);
  assert.equal(edited.data.discussions.length,3);
  assert.equal(edited.data.discussions[0].messages.length,3);
  const feedback=await request(`/sessions/${logged.data.id}/feedback`,{feedback:"Prior whole-workout feedback"},a.cookie,"PATCH");
  assert.equal(feedback.status,200);
  assert.equal(feedback.data.discussions.length,3);
  assert.equal((await request(discussionPath,null,clientA.cookie)).data.legacyFeedback,"Prior whole-workout feedback");
  logged.data=feedback.data;
  assert.equal((await request("/bodyweights",{date:"2026-10-15",weight:180,unit:"lb",timeOfDay:"morning"},clientA.cookie)).status,200);
  assert.equal((await request("/maxes",{date:"2026-10-15",lift:"squat",weight:325,unit:"lb"},clientA.cookie)).status,200);
  assert.equal((await request(`/athletes/${clientA.id}/bodyweights`,null,a.cookie)).data[0].weight,180);
  assert.equal((await request(`/athletes/${clientA.id}/bodyweights`,null,b.cookie)).status,403);
  const scope=`private-${randomBytes(6).toString("hex")}`;workspaceIds.push(scope);
  const privateAdmin=await createPrivateAdmin(pool,{workspaceId:scope,workspaceName:"Personal coaching",username:username(),name:"Private admin"});
  ids.push(privateAdmin.userId);
  const signedPrivate=await request("/auth/password-setup",{token:new URLSearchParams(privateAdmin.path.split("#")[1]).get("token"),password});
  assert.equal(signedPrivate.status,200);
  const privateCoach=await create("/coaches",signedPrivate.cookie,"Private coach");
  const privateClient=await create("/password-accounts",privateCoach.cookie,"Private client");
  const privateProgram=await request("/programs",{...program,name:"PRIVATE TEMPLATE"},privateCoach.cookie);
  assert.equal(privateProgram.status,200);
  const privateWorkspace=(await request("/workspace",null,privateCoach.cookie)).data;
  assert.equal(privateWorkspace.workspaceId,scope);
  assert.deepEqual(privateWorkspace.programs.map(p=>p.id),[privateProgram.data.id]);
  assert.equal((await request("/workspace",null,a.cookie)).data.programs.some(p=>p.id===privateProgram.data.id),false);
  assert.deepEqual((await request("/coaches",null,signedPrivate.cookie)).data.map(c=>c.userId),[privateCoach.id]);
  assert.equal((await request("/coaches",null,adminCookie)).data.some(c=>c.userId===privateCoach.id),false);
  assert.equal((await request(historyPath,null,signedPrivate.cookie)).status,403);
  assert.equal((await request(discussionPath,null,signedPrivate.cookie)).status,403);
  assert.equal((await request(`/athletes/${clientA.id}/bodyweights`,null,privateCoach.cookie)).status,403);
  assert.equal((await request("/assignments",{programId:p.id,athleteId:privateClient.id,startDate:"2026-10-15"},privateCoach.cookie)).status,404);
  assert.equal((await request("/coaches",{userId:a.id,username:a.username},signedPrivate.cookie)).status,403);
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
  const retained=(await request("/coaches",null,adminCookie)).data.find(c=>c.userId===a.id);
  assert.equal(retained.programs.some(x=>x.id===p.id),false);
  assert.equal(retained.clients.find(c=>c.id===clientA.id).blocks[0].program.name,p.name);
  assert.deepEqual(await historicalFingerprint(clientA.id),before);
  const clientWorkspace=(await request("/workspace",null,clientA.cookie)).data;
  assert.equal(clientWorkspace.programs.length,0);
  assert.equal(clientWorkspace.assignments[0].program.name,"TEST shared program");
  assert.equal(clientWorkspace.sessions[0].sets[0].weight,315);
  // Exercise archived/removed history using this test's assignment only.
  await pool.query(`UPDATE training_assignments SET data=data || '{"archived":true,"removed":true}'::jsonb WHERE id=$1`,[assignment.id]);
  assert.deepEqual((await request(historyPath,null,adminCookie)).data,[logged.data]);
  assert.equal((await request(discussionPath,null,clientA.cookie)).data.threads.length,3);
  const oldBlocks=(await request("/coaches",null,adminCookie)).data.find(c=>c.userId===a.id).clients.find(c=>c.id===clientA.id).blocks;
  assert.equal(oldBlocks.find(x=>x.id===assignment.id).removed,true);
  console.log("PASS: admin onboarding; independent coaches/clients; global library; uploader-only changes; copy ownership; cross-coach mutation and credential denial; assignment/session/1RM/bodyweight fingerprints unchanged after template rename/delete.");
} finally {
  for(const table of ["training_sessions","training_assignments","training_bodyweights","training_true_maxes"]) await pool.query(`DELETE FROM ${table} WHERE athlete_id=ANY($1::text[])`,[ids]);
  for(const table of ["password_setups","password_credentials","training_profiles"]) await pool.query(`DELETE FROM ${table} WHERE user_id=ANY($1::text[])`,[ids]);
  await pool.query("DELETE FROM sessions WHERE sess->'user'->>'id'=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM coaching_invitations WHERE coach_id=ANY($1::text[]) OR accepted_by=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM coaching_links WHERE coach_id=ANY($1::text[]) OR athlete_id=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM training_programs WHERE owner_id=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM app_coaches WHERE user_id=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM app_administration WHERE user_id=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM app_workspace_members WHERE user_id=ANY($1::text[])",[ids]);
  await pool.query("DELETE FROM app_workspaces WHERE id=ANY($1::text[])",[workspaceIds]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::text[])",[ids]);
  const keys=["setup-ip","setup-info-ip"].map(scope=>digest(`${scope}:${ip}`));
  await pool.query("DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])",[keys]);
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pool.end();
}
