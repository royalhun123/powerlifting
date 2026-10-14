import { randomBytes, randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, profilesTable, programsTable, assignmentsTable, workoutsTable, coachingTable, invitationsTable, bodyweightsTable, trueMaxesTable } from "@workspace/db";
import {
  GetWorkspaceResponse, UpdateProfileBody, UpdateProfileResponse, SaveProgramBody, SaveProgramResponse,
  DeleteProgramParams, CreateInvitationBody, CreateInvitationResponse, RevokeInvitationParams, AcceptInvitationBody,
  AssignProgramBody, AssignProgramResponse, SaveSessionBody, SaveSessionResponse, DeleteSessionParams,
  UpdateFeedbackParams, UpdateFeedbackBody, UpdateFeedbackResponse, GetAnalyticsQueryParams, GetAnalyticsResponse,
  GetBodyweightsResponse, SaveBodyweightBody, SaveBodyweightResponse,
  GetTrueMaxesResponse, SaveTrueMaxBody, SaveTrueMaxResponse,
} from "@workspace/api-zod";
import { ensureProfile, linked, loadWorkspace } from "../lib/training-store";
import { demoWorkspace } from "../lib/demo";
import { analytics } from "../lib/analytics";
import { normalizeProgram } from "../lib/program-defaults";
import { isCoach } from "../lib/coach-access";
import { fail, dateValid, sessionVolume, type Program, type Assignment, type Session } from "../lib/training-types";

const router:IRouter = Router();

router.get("/bodyweights", async (req,res) => {
  if (!req.user) { res.json([]); return; }
  const rows = await db.select().from(bodyweightsTable)
    .where(eq(bodyweightsTable.athleteId,req.user.id)).orderBy(bodyweightsTable.date);
  const times=["morning","day","night","unspecified"];
  res.json(GetBodyweightsResponse.parse(rows.map(r=>r.data)).sort((a,b)=>a.date.localeCompare(b.date)||times.indexOf(a.timeOfDay)-times.indexOf(b.timeOfDay)));
});
router.get("/maxes", async (req,res) => {
  if (!req.user) {res.json([]);return;}
  const rows=await db.select().from(trueMaxesTable).where(eq(trueMaxesTable.athleteId,req.user.id)).orderBy(trueMaxesTable.date);
  res.json(GetTrueMaxesResponse.parse(rows.map(r=>r.data)));
});
router.get("/workspace", async (req,res) => {
  const workspace=req.user ? await loadWorkspace(req.user.id,req.user.firstName || "Athlete") : demoWorkspace();
  res.json(GetWorkspaceResponse.parse(workspace));
});
router.get("/analytics", async (req,res) => {
  const params=GetAnalyticsQueryParams.parse({
    ...req.query,
    ...(typeof req.query.days === "string" ? { days: Number(req.query.days) } : {}),
  });
  const workspace=req.user ? await loadWorkspace(req.user.id,req.user.firstName || "Athlete") : demoWorkspace();
  const athleteId=params.athleteId || workspace.profile.id;
  if (athleteId !== workspace.profile.id && !workspace.athletes.some(a=>a.id === athleteId)) fail(403,"You do not have access to this athlete.");
  const maxRows=req.user ? await db.select().from(trueMaxesTable).where(eq(trueMaxesTable.athleteId,athleteId)) : [];
  res.json(GetAnalyticsResponse.parse(analytics(workspace.sessions.filter(s=>s.athleteId === athleteId),workspace.profile.unit,params.days ?? 90,GetTrueMaxesResponse.parse(maxRows.map(r=>r.data)))));
});
// All remaining endpoints mutate private account data and require a real login.
router.use(async (req,res,next) => {
  if (!req.isAuthenticated()) {res.status(401).json({error:"Sign in to save training or manage clients."});return;}
  if (/^\/(programs|invitations|assignments|feedback)(\/|$)/.test(req.path) && !isCoach(req.user.id)) {
    res.status(403).json({error:"Only the coach can manage programs and clients."});return;
  }
  await ensureProfile(req.user.id,req.user.firstName || "Athlete");
  next();
});
router.patch("/profile", async (req,res) => {
  const input=UpdateProfileBody.parse(req.body);
  if (input.meetDate && !dateValid(input.meetDate)) fail(400,"Enter a valid meet date.");
  const profile=UpdateProfileResponse.parse({...input,name:input.name.trim() || "Athlete",id:req.user!.id,coachName:""});
  await db.update(profilesTable).set({data:profile}).where(eq(profilesTable.userId,req.user!.id));
  res.json(profile);
});
router.post("/bodyweights", async (req,res) => {
  const input=SaveBodyweightBody.parse(req.body);
  if(!dateValid(input.date)) fail(400,"Enter a valid bodyweight date.");
  if(input.timeOfDay==="unspecified") fail(400,"Choose morning, day, or night.");
  await db.insert(bodyweightsTable).values({athleteId:req.user!.id,date:input.date,timeOfDay:input.timeOfDay,data:input})
    .onConflictDoUpdate({target:[bodyweightsTable.athleteId,bodyweightsTable.date,bodyweightsTable.timeOfDay],set:{data:input}});
  res.json(SaveBodyweightResponse.parse(input));
});
router.delete("/bodyweights/:date/:timeOfDay", async (req,res) => {
  const date=String(req.params.date);
  if(!dateValid(date)) fail(400,"Enter a valid bodyweight date.");
  await db.delete(bodyweightsTable).where(and(eq(bodyweightsTable.athleteId,req.user!.id),eq(bodyweightsTable.date,date),eq(bodyweightsTable.timeOfDay,String(req.params.timeOfDay))));
  res.json({success:true});
});
router.post("/maxes", async (req,res) => {
  const input=SaveTrueMaxBody.parse(req.body);
  if(!dateValid(input.date)) fail(400,"Enter a valid max date.");
  const max=SaveTrueMaxResponse.parse({...input,id:input.id || randomUUID()});
  if(input.id) {
    const rows=await db.update(trueMaxesTable).set({date:max.date,data:max})
      .where(and(eq(trueMaxesTable.id,input.id),eq(trueMaxesTable.athleteId,req.user!.id))).returning();
    if(!rows.length) fail(404,"Max entry not found.");
  } else {
    await db.insert(trueMaxesTable).values({id:max.id,athleteId:req.user!.id,date:max.date,data:max});
  }
  res.json(max);
});
router.delete("/maxes/:id", async (req,res) => {
  const rows=await db.delete(trueMaxesTable).where(and(eq(trueMaxesTable.id,String(req.params.id)),eq(trueMaxesTable.athleteId,req.user!.id))).returning();
  if(!rows.length) fail(404,"Max entry not found.");
  res.json({success:true});
});
router.post("/programs", async (req,res) => {
  const input=SaveProgramBody.parse(req.body);
  if (!input.name.trim()) fail(400,"A program name is required.");
  if (new Set(input.workouts.map(w=>w.id)).size !== input.workouts.length) fail(400,"Workout identifiers must be unique.");
  for(const w of input.workouts) {
    if(w.week>input.weeks) fail(400,"Workout week exceeds program length.");
    if(new Set(w.exercises.map(e=>e.id)).size !== w.exercises.length) fail(400,"Exercise identifiers must be unique within a workout.");
    for (const ex of w.exercises) {
      const range = /^\s*(\d+)\s*[-–—]\s*(\d+)\s*$/.exec(ex.reps);
      if (range && (Number(range[1]) < 1 || Number(range[2]) < Number(range[1]) || Number(range[2]) > 1000)) {
        fail(400,`${ex.name}: enter a rep range with a positive minimum no greater than the maximum, for example 8-12.`);
      }
    }
  }
  let source="Custom program";
  if (input.id) {
    const [row]=await db.select().from(programsTable).where(and(eq(programsTable.id,input.id),eq(programsTable.ownerId,req.user!.id)));
    if(!row) fail(404,"Program not found.");
    source=SaveProgramResponse.parse(row.data).source;
  }
  const program:Program=normalizeProgram(SaveProgramResponse.parse({...input,id:input.id || randomUUID(),source,reviewCount:input.workouts.reduce((n,w)=>n+w.exercises.filter(e=>e.review).length,0)}));
  if(input.id) await db.update(programsTable).set({data:program}).where(and(eq(programsTable.id,input.id),eq(programsTable.ownerId,req.user!.id)));
  else await db.insert(programsTable).values({id:program.id,ownerId:req.user!.id,data:program});
  res.json(program);
});
router.delete("/programs/:id", async (req,res) => {
  const {id}=DeleteProgramParams.parse(req.params);
  const rows=await db.delete(programsTable).where(and(eq(programsTable.id,id),eq(programsTable.ownerId,req.user!.id))).returning();
  if(!rows.length) fail(404,"Program not found.");
  res.json({success:true});
});
router.post("/invitations", async (req,res) => {
  const input=CreateInvitationBody.parse(req.body);
  const existing=await db.select().from(invitationsTable).where(eq(invitationsTable.coachId,req.user!.id));
  if(existing.filter(r=>!r.acceptedBy && r.expiresAt.getTime()>Date.now()).length>=50) fail(400,"Revoke an unused invitation before creating more.");
  const id=randomUUID(),token=randomBytes(24).toString("hex"),expiresAt=new Date(Date.now()+7*24*60*60*1000);
  await db.insert(invitationsTable).values({id,coachId:req.user!.id,name:input.name,token,expiresAt});
  res.json(CreateInvitationResponse.parse({id,name:input.name,path:`/join?token=${token}`,expiresAt:expiresAt.toISOString(),status:"pending"}));
});
router.delete("/invitations/:id", async (req,res) => {
  const {id}=RevokeInvitationParams.parse(req.params);
  const rows=await db.delete(invitationsTable).where(and(eq(invitationsTable.id,id),eq(invitationsTable.coachId,req.user!.id))).returning();
  if(!rows.length) fail(404,"Invitation not found.");
  res.json({success:true});
});
router.post("/join", async (req,res) => {
  const {token}=AcceptInvitationBody.parse(req.body);
  await db.transaction(async tx=>{
    const [invite]=await tx.select().from(invitationsTable).where(eq(invitationsTable.token,token)).for("update");
    if(!invite || invite.expiresAt.getTime()<Date.now()) fail(400,"This invitation has expired or was revoked.");
    if(!isCoach(invite.coachId)) fail(400,"This invitation is no longer valid. Ask your coach for a new link.");
    if(invite.coachId===req.user!.id) fail(400,"You cannot accept your own invitation.");
    if(invite.acceptedBy && invite.acceptedBy!==req.user!.id) fail(409,"This invitation has already been used.");
    await tx.insert(coachingTable).values({coachId:invite.coachId,athleteId:req.user!.id}).onConflictDoNothing();
    await tx.update(invitationsTable).set({acceptedBy:req.user!.id}).where(eq(invitationsTable.id,invite.id));
  });
  res.json({success:true});
});
router.post("/assignments", async (req,res) => {
  const input=AssignProgramBody.parse(req.body);
  if(!dateValid(input.startDate)) fail(400,"Enter a valid start date.");
  if(!await linked(req.user!.id,input.athleteId)) fail(403,"Invite this athlete and wait for them to accept first.");
  const [row]=await db.select().from(programsTable).where(and(eq(programsTable.id,input.programId),eq(programsTable.ownerId,req.user!.id)));
  if(!row) fail(404,"Program not found.");
  const program=normalizeProgram(SaveProgramResponse.parse(row.data));
  const [athlete]=await db.select().from(profilesTable).where(eq(profilesTable.userId,input.athleteId));
  const coach=await ensureProfile(req.user!.id,req.user!.firstName || "Coach");
  if(!athlete) fail(404,"Athlete not found.");
  const assignment:Assignment={id:randomUUID(),athleteId:input.athleteId,athleteName:UpdateProfileResponse.parse(athlete.data).name,program,startDate:input.startDate,coachName:coach.name};
  await db.insert(assignmentsTable).values({id:assignment.id,coachId:req.user!.id,athleteId:input.athleteId,data:assignment});
  res.json(AssignProgramResponse.parse(assignment));
});
router.post("/sessions", async (req,res) => {
  const input=SaveSessionBody.parse(req.body);
  if(!dateValid(input.date)) fail(400,"Enter a valid workout date.");
  const [assigned]=await db.select().from(assignmentsTable).where(and(eq(assignmentsTable.id,input.assignmentId),eq(assignmentsTable.athleteId,req.user!.id)));
  if(!assigned) fail(403,"You can log only your own assigned workouts.");
  const assignment=AssignProgramResponse.parse(assigned.data);
  const workout=assignment.program.workouts.find(w=>w.id===input.workoutId);
  if(!workout) fail(400,"Workout not found in this assignment.");
  if(new Set(input.sets.map(s=>`${s.exerciseId}:${s.setNumber}`)).size!==input.sets.length) fail(400,"Duplicate exercise/set number.");
  const normalizedSets=input.sets.map(s=>{
    const ex=workout.exercises.find(e=>e.id===s.exerciseId);
    if(!ex) fail(400,"Exercise not found in assigned workout.");
    // Competition classification comes from the assigned program, not the client.
    return {...s,exerciseName:ex.name,lift:ex.lift,completed:s.reps>0 && (s.weight>0 || ex.lift==="accessory")};
  });
  if(normalizedSets.some(s=>s.reps>0 && s.lift!=="accessory" && s.weight<=0)) fail(400,"Enter a weight for competition-lift sets with completed reps. Record failed attempts with zero reps and a note.");
  if(input.status==="completed" && !normalizedSets.some(s=>s.completed && s.reps>0)) fail(400,"Complete at least one set with reps before finishing.");
  const profile=await ensureProfile(req.user!.id,req.user!.firstName || "Athlete");
  const saved=await db.transaction(async tx=>{
    let previous:Session | undefined;
    if(input.id) {
      const [row]=await tx.select().from(workoutsTable).where(and(eq(workoutsTable.id,input.id),eq(workoutsTable.athleteId,req.user!.id))).for("update");
      if(!row) fail(404,"Workout log not found.");
      previous=SaveSessionResponse.parse(row.data);
      if(previous.assignmentId!==input.assignmentId || previous.workoutId!==input.workoutId) fail(400,"Cannot move a log to another workout.");
    }
    const session:Session={...input,sets:normalizedSets,id:input.id || randomUUID(),athleteId:req.user!.id,athleteName:profile.name,coachFeedback:previous?.coachFeedback || "",volume:sessionVolume({sets:normalizedSets}),updatedAt:new Date().toISOString()};
    if(input.id) await tx.update(workoutsTable).set({data:session}).where(and(eq(workoutsTable.id,input.id),eq(workoutsTable.athleteId,req.user!.id)));
    else await tx.insert(workoutsTable).values({id:session.id,athleteId:req.user!.id,assignmentId:input.assignmentId,data:session});
    return session;
  });
  res.json(SaveSessionResponse.parse(saved));
});
router.delete("/sessions/:id", async (req,res) => {
  const {id}=DeleteSessionParams.parse(req.params);
  const rows=await db.delete(workoutsTable).where(and(eq(workoutsTable.id,id),eq(workoutsTable.athleteId,req.user!.id))).returning();
  if(!rows.length) fail(404,"Workout log not found.");
  res.json({success:true});
});
router.patch("/sessions/:id/feedback", async (req,res) => {
  if(!isCoach(req.user!.id)) fail(403,"Only the coach can leave feedback.");
  const {id}=UpdateFeedbackParams.parse(req.params);
  const {feedback}=UpdateFeedbackBody.parse(req.body);
  const saved=await db.transaction(async tx=>{
    const [row]=await tx.select().from(workoutsTable).where(eq(workoutsTable.id,id)).for("update");
    if(!row || row.athleteId===req.user!.id || !await linked(req.user!.id,row.athleteId)) fail(403,"Only a linked coach can leave feedback.");
    const session={...SaveSessionResponse.parse(row.data),coachFeedback:feedback,updatedAt:new Date().toISOString()};
    await tx.update(workoutsTable).set({data:session}).where(eq(workoutsTable.id,id));
    return session;
  });
  res.json(UpdateFeedbackResponse.parse(saved));
});
export default router;
