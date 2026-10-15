import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db, groupsTable, groupMembersTable, groupInvitesTable, usersTable, profilesTable, credentialsTable, workspaceMembersTable, coachingTable } from "@workspace/db";
import { CreateLiftingGroupBody, GetGroupInvitationInfoBody, AcceptGroupInvitationBody } from "@workspace/api-zod";
import { isAdmin } from "../lib/coach-access";
import { workspaceId, workspaceInfo } from "../lib/workspace-access";
import { fail } from "../lib/training-types";
import { hashSetupToken, hashPassword, normalizeUsername } from "../lib/password-crypto";
import { authLimit, issuePasswordSession } from "../lib/password-access";
import { clearSession, getSessionId } from "../lib/auth";

const router=Router();
router.use("/groups",(_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
async function lifter(req: Express.Request) {
  if(!req.user) fail(401,"Sign in first.");
  if(await isAdmin(req.user.id)) fail(403,"Administrators have read-only access to lifters and groups.");
  return req.user.id;
}
router.get("/groups",async(req,res)=>{
  if(!req.user) fail(401,"Sign in first.");
  const scope=await workspaceId(req.user.id);
  const memberships=await db.select().from(groupMembersTable).where(eq(groupMembersTable.userId,req.user.id));
  const rows=await db.select().from(groupsTable).where(and(eq(groupsTable.workspaceId,scope),
    await isAdmin(req.user.id) ? undefined : inArray(groupsTable.id,memberships.map(m=>m.groupId))));
  const members=rows.length ? await db.select({id:groupMembersTable.userId,groupId:groupMembersTable.groupId,profile:profilesTable.data})
    .from(groupMembersTable).leftJoin(profilesTable,eq(profilesTable.userId,groupMembersTable.userId))
    .where(inArray(groupMembersTable.groupId,rows.map(g=>g.id))) : [];
  res.json(rows.map(g=>({...g,members:members.filter(m=>m.groupId===g.id).map(m=>({id:m.id,name:(m.profile as {name?:string})?.name || "Lifter"}))})));
});
router.post("/groups",async(req,res)=>{
  const id=await lifter(req), scope=await workspaceId(id);
  const {name}=CreateLiftingGroupBody.parse(req.body);
  if(!name.trim()) fail(400,"Enter a group name.");
  const group={id:randomUUID(),workspaceId:scope,leaderId:id,name:name.trim()};
  await db.transaction(async tx=>{
    await tx.select().from(usersTable).where(eq(usersTable.id,id)).for("update");
    const [member]=await tx.select().from(groupMembersTable).where(eq(groupMembersTable.userId,id));
    if(member) fail(409,"Leave your current group before creating another.");
    await tx.insert(groupsTable).values(group);
    await tx.insert(groupMembersTable).values({userId:id,groupId:group.id});
  });
  res.json(group);
});
router.post("/groups/leave",async(req,res)=>{
  const id=await lifter(req);
  await db.transaction(async tx=>{
    const [membership]=await tx.select().from(groupMembersTable).where(eq(groupMembersTable.userId,id));
    if(!membership) fail(409,"You are not in a lifting group.");
    const [group]=await tx.select().from(groupsTable).where(eq(groupsTable.id,membership.groupId)).for("update");
    if(!group) fail(409,"This group no longer exists.");
    await tx.select().from(usersTable).where(eq(usersTable.id,id)).for("update");
    if(group.leaderId===id) fail(409,"As group leader, delete the group to leave. Everyone's training history will remain.");
    await tx.delete(groupMembersTable).where(and(eq(groupMembersTable.userId,id),eq(groupMembersTable.groupId,group.id)));
    await tx.delete(coachingTable).where(and(eq(coachingTable.coachId,group.leaderId),eq(coachingTable.athleteId,id)));
  });
  res.json({success:true});
});
router.delete("/groups/current",async(req,res)=>{
  const id=await lifter(req);
  await db.transaction(async tx=>{
    const [group]=await tx.select().from(groupsTable).where(eq(groupsTable.leaderId,id)).for("update");
    if(!group) fail(403,"Only the group leader may delete a group.");
    await tx.delete(coachingTable).where(eq(coachingTable.coachId,id));
    await tx.delete(groupsTable).where(eq(groupsTable.id,group.id));
  });
  res.json({success:true});
});
router.delete("/groups/members/:userId",async(req,res)=>{
  const id=await lifter(req), target=req.params.userId;
  if(id===target) fail(403,"Group leaders cannot remove themselves. Use Delete group instead.");
  await db.transaction(async tx=>{
    const [group]=await tx.select().from(groupsTable).where(eq(groupsTable.leaderId,id)).for("update");
    if(!group) fail(403,"Only the group leader may remove a lifter.");
    await tx.select().from(usersTable).where(eq(usersTable.id,target)).for("update");
    const removed=await tx.delete(groupMembersTable).where(and(eq(groupMembersTable.userId,target),eq(groupMembersTable.groupId,group.id))).returning();
    if(!removed.length) fail(404,"This lifter is not in your group.");
    await tx.delete(coachingTable).where(and(eq(coachingTable.coachId,id),eq(coachingTable.athleteId,target)));
  });
  res.json({success:true});
});
router.post("/groups/invitations",async(req,res)=>{
  const id=await lifter(req), token=randomBytes(32).toString("base64url");
  const expiresAt=new Date(Date.now()+86400000);
  await db.transaction(async tx=>{
    const [group]=await tx.select().from(groupsTable).where(eq(groupsTable.leaderId,id)).for("update");
    if(!group) fail(403,"Only a group leader can invite lifters.");
    await tx.insert(groupInvitesTable).values({tokenHash:hashSetupToken(token),groupId:group.id,expiresAt});
  });
  res.json({path:`/join-group#token=${token}`,expiresAt:expiresAt.toISOString()});
});
router.post("/groups/invitations/info",async(req,res)=>{
  await authLimit(req,"group-info",60);
  const {token}=GetGroupInvitationInfoBody.parse(req.body);
  const [row]=await db.select({group:groupsTable}).from(groupInvitesTable)
    .innerJoin(groupsTable,eq(groupsTable.id,groupInvitesTable.groupId))
    .where(and(eq(groupInvitesTable.tokenHash,hashSetupToken(token)),gt(groupInvitesTable.expiresAt,new Date()),isNull(groupInvitesTable.usedBy)));
  if(!row) fail(410,"This invitation is expired, used, or the group was deleted.");
  const scope=await workspaceInfo(row.group.leaderId);
  res.json({name:row.group.name,workspaceName:scope.workspaceName});
});
router.post("/groups/invitations/accept",async(req,res)=>{
  await authLimit(req,"group-accept",20);
  const input=AcceptGroupInvitationBody.parse(req.body);
  const id=req.user?.id ?? randomUUID();
  if(req.user && await isAdmin(id)) fail(403,"Administrators cannot join lifting groups.");
  if(!req.user && (!input.username || !input.password)) fail(400,"Choose a username and password, or sign in to your existing account.");
  const passwordHash=!req.user ? await hashPassword(input.password!) : null;
  const tokenHash=hashSetupToken(input.token);
  const scope=req.user ? await workspaceId(id) : null;
  try {
    await db.transaction(async tx=>{
      const [invite]=await tx.select().from(groupInvitesTable).where(eq(groupInvitesTable.tokenHash,tokenHash));
      if(!invite || invite.usedBy || invite.expiresAt<=new Date()) fail(410,"This invitation is expired or already used.");
      const [group]=await tx.select().from(groupsTable).where(eq(groupsTable.id,invite.groupId)).for("update");
      if(!group) fail(410,"This group no longer exists.");
      if(scope && group.workspaceId!==scope) fail(403,"This invitation belongs to another private workspace. Accounts cannot move between workspaces.");
      if(req.user) {
        await tx.select().from(usersTable).where(eq(usersTable.id,id)).for("update");
        const [member]=await tx.select().from(groupMembersTable).where(eq(groupMembersTable.userId,id));
        if(member) fail(409,"You can belong to only one lifting group. Leave your current group first.");
      } else {
        const username=normalizeUsername(input.username!), name=input.name?.trim() || username;
        await tx.insert(usersTable).values({id,firstName:name});
        await tx.insert(workspaceMembersTable).values({userId:id,workspaceId:group.workspaceId});
        await tx.insert(profilesTable).values({userId:id,data:{id,name,unit:"lb",meetDate:"",squatMax:0,benchMax:0,deadliftMax:0,coachName:""}});
        await tx.insert(credentialsTable).values({userId:id,username,passwordHash});
      }
      const used=await tx.update(groupInvitesTable).set({usedBy:id}).where(and(eq(groupInvitesTable.tokenHash,tokenHash),isNull(groupInvitesTable.usedBy),gt(groupInvitesTable.expiresAt,new Date()))).returning();
      if(!used.length) fail(410,"This invitation is expired or already used.");
      await tx.insert(groupMembersTable).values({userId:id,groupId:group.id});
      await tx.insert(coachingTable).values({coachId:group.leaderId,athleteId:id});
    });
  } catch(error) {
    const e=error as {code?:string;cause?:{code?:string}};
    if(e.code==="23505" || e.cause?.code==="23505") fail(409,"That username is already taken, or this account already belongs to a group. Your unused invitation remains valid.");
    throw error;
  }
  if(!req.user) {await clearSession(res,getSessionId(req));await issuePasswordSession(res,id,0);}
  res.json({success:true});
});
export default router;
