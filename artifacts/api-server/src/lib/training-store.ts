import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, profilesTable, programsTable, assignmentsTable, workoutsTable, coachingTable, invitationsTable, groupsTable, groupMembersTable } from "@workspace/db";
import { SaveProgramResponse, UpdateProfileResponse, AssignProgramResponse, SaveSessionResponse } from "@workspace/api-zod";
import imported from "../data/imported-programs.json";
import type { Profile, Workspace } from "./training-types";
import { convert, round } from "./training-types";
import { normalizeProgram } from "./program-defaults";
import { isCoach, isAdmin } from "./coach-access";
import { privateLoginEnabled, PRIVATE_PREFIX } from "./private-access";
import { sameWorkspace, workspaceUserIds, workspaceInfo } from "./workspace-access";

export async function ensureProfile(id: string, name: string): Promise<Profile> {
  const [existing] = await db.select().from(profilesTable).where(eq(profilesTable.userId,id));
  if (existing) return UpdateProfileResponse.parse(existing.data);
  const profile:Profile = {id,name:name || "Athlete",unit:"lb",meetDate:"",squatMax:0,benchMax:0,deadliftMax:0,coachName:""};
  await db.transaction(async tx => {
    const inserted = await tx.insert(profilesTable).values({userId:id,data:profile}).onConflictDoNothing().returning();
    if (!inserted.length || !await isCoach(id)) return;
    // Each account owns its own editable copies. Source cells are prescriptions,
    // never seeded as completed sessions or counted in progress.
    const templates = imported.map(raw => {
      const program = normalizeProgram(SaveProgramResponse.parse({...raw,id:randomUUID()}));
      return {id:program.id,ownerId:id,data:program};
    });
    await tx.insert(programsTable).values(templates);
  });
  const [row] = await db.select().from(profilesTable).where(eq(profilesTable.userId,id));
  return UpdateProfileResponse.parse(row!.data);
}

export async function linked(coachId: string, athleteId: string): Promise<boolean> {
  if (coachId === athleteId) return true;
  if (!await sameWorkspace(coachId, athleteId)) return false;
  const rows = await db.select().from(groupMembersTable).innerJoin(groupsTable,eq(groupMembersTable.groupId,groupsTable.id)).where(and(eq(groupsTable.leaderId,coachId),eq(groupMembersTable.userId,athleteId)));
  return rows.length > 0;
}

export async function loadWorkspace(id: string, name: string): Promise<Workspace> {
  const profile = await ensureProfile(id,name);
  const coach = await isCoach(id);
  const admin = await isAdmin(id);
  const [membership] = await db.select({group:groupsTable}).from(groupMembersTable).innerJoin(groupsTable,eq(groupMembersTable.groupId,groupsTable.id)).where(eq(groupMembersTable.userId,id));
  const group = membership?.group ?? null;
  const allowedIds = await workspaceUserIds(id);
  const links = coach && group ? (await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId,group.id))).filter(m=>m.userId!==id&&allowedIds.includes(m.userId)).map(m=>({athleteId:m.userId,coachId:id})) : [];
  const athleteIds = links.map(l => l.athleteId);
  const ids = [id,...athleteIds];
  const [programRows, assignmentRows, sessionRows, invitationRows, profileRows] = await Promise.all([
    !admin ? db.select().from(programsTable).where(inArray(programsTable.ownerId,allowedIds)) : Promise.resolve([]),
    db.select().from(assignmentsTable).where(inArray(assignmentsTable.athleteId,ids)),
    db.select().from(workoutsTable).where(inArray(workoutsTable.athleteId,ids)),
    coach ? db.select().from(invitationsTable).where(eq(invitationsTable.coachId,id)) : Promise.resolve([]),
    athleteIds.length ? db.select().from(profilesTable).where(inArray(profilesTable.userId,athleteIds)) : Promise.resolve([]),
  ]);
  const sessions = sessionRows.map(r => SaveSessionResponse.parse(r.data)).sort((a,b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  const athletes = profileRows.map(r => {
    const p=UpdateProfileResponse.parse(r.data);
    const logs=sessions.filter(s => s.athleteId === r.userId && s.status === "completed");
    return {id:r.userId,name:p.name,unit:profile.unit,sessions:logs.length,lastActive:logs[0]?.date ?? "",totalVolume:round(logs.reduce((total,s) => total+convert(s.volume,s.unit,profile.unit),0))};
  });
  profile.coachName="";
  if(group && group.leaderId!==id) {
    const [leader]=await db.select().from(profilesTable).where(eq(profilesTable.userId,group.leaderId));
    profile.coachName=leader ? UpdateProfileResponse.parse(leader.data).name : "";
  }
  const ownerIds = [...new Set([...programRows.map(r=>r.ownerId), ...assignmentRows.map(r=>r.coachId)])];
  const owners = ownerIds.length ? await db.select().from(profilesTable).where(inArray(profilesTable.userId,ownerIds)) : [];
  const ownerNames = new Map(owners.map(r=>[r.userId,UpdateProfileResponse.parse(r.data).name]));
  return {...await workspaceInfo(id),group,isLifter:!admin,isGroupLeader:coach,demo:false,isCoach:coach,isAdmin:admin,privateLogin:privateLoginEnabled(),profile,programs:programRows.map(r=>({...normalizeProgram(SaveProgramResponse.parse(r.data)),uploaderId:r.ownerId,uploaderName:ownerNames.get(r.ownerId) || "Lifter"})),athletes,
    assignments:assignmentRows.map(r=>{
      const assignment=AssignProgramResponse.parse(r.data);
      // Legacy assignments predate sharing and were owned by the assigning coach.
      // Add provenance to the response only, never rewrite a historical snapshot.
      return {...assignment,program:{...normalizeProgram(assignment.program),
        uploaderId:assignment.program.uploaderId || r.coachId,
        uploaderName:assignment.program.uploaderName || ownerNames.get(r.coachId) || "Coach"}};
    }).filter(a=>!a.removed),
    sessions,invitations:(invitationRows as (typeof invitationsTable.$inferSelect)[]).filter(r=>!r.token.startsWith(PRIVATE_PREFIX)).map(r=>({id:r.id,name:r.name,path:r.acceptedBy ? "" : `/join?token=${r.token}`,expiresAt:r.expiresAt.toISOString(),status:r.acceptedBy ? "accepted" as const : r.expiresAt.getTime()<Date.now() ? "expired" as const : "pending" as const}))};
}
