import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, profilesTable, programsTable, assignmentsTable, workoutsTable, coachingTable, invitationsTable } from "@workspace/db";
import { SaveProgramResponse, UpdateProfileResponse, AssignProgramResponse, SaveSessionResponse } from "@workspace/api-zod";
import imported from "../data/imported-programs.json";
import type { Profile, Workspace } from "./training-types";
import { convert, round } from "./training-types";
import { normalizeProgram } from "./program-defaults";

export async function ensureProfile(id: string, name: string): Promise<Profile> {
  const [existing] = await db.select().from(profilesTable).where(eq(profilesTable.userId,id));
  if (existing) return UpdateProfileResponse.parse(existing.data);
  const profile:Profile = {id,name:name || "Athlete",unit:"lb",meetDate:"",squatMax:0,benchMax:0,deadliftMax:0,coachName:""};
  await db.transaction(async tx => {
    const inserted = await tx.insert(profilesTable).values({userId:id,data:profile}).onConflictDoNothing().returning();
    if (!inserted.length) return;
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
  const rows = await db.select().from(coachingTable).where(and(eq(coachingTable.coachId,coachId),eq(coachingTable.athleteId,athleteId)));
  return rows.length > 0;
}

export async function loadWorkspace(id: string, name: string): Promise<Workspace> {
  const profile = await ensureProfile(id,name);
  const links = await db.select().from(coachingTable).where(eq(coachingTable.coachId,id));
  const athleteIds = links.map(l => l.athleteId);
  const ids = [id,...athleteIds];
  const [programRows, assignmentRows, sessionRows, invitationRows, profileRows, coachLinks] = await Promise.all([
    db.select().from(programsTable).where(eq(programsTable.ownerId,id)),
    db.select().from(assignmentsTable).where(or(eq(assignmentsTable.coachId,id),eq(assignmentsTable.athleteId,id))),
    db.select().from(workoutsTable).where(inArray(workoutsTable.athleteId,ids)),
    db.select().from(invitationsTable).where(eq(invitationsTable.coachId,id)),
    athleteIds.length ? db.select().from(profilesTable).where(inArray(profilesTable.userId,athleteIds)) : Promise.resolve([]),
    db.select().from(coachingTable).where(eq(coachingTable.athleteId,id)),
  ]);
  const sessions = sessionRows.map(r => SaveSessionResponse.parse(r.data)).sort((a,b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  const athletes = profileRows.map(r => {
    const p=UpdateProfileResponse.parse(r.data);
    const logs=sessions.filter(s => s.athleteId === r.userId && s.status === "completed");
    return {id:r.userId,name:p.name,unit:profile.unit,sessions:logs.length,lastActive:logs[0]?.date ?? "",totalVolume:round(logs.reduce((total,s) => total+convert(s.volume,s.unit,profile.unit),0))};
  });
  if(coachLinks.length) {
    const coaches = await db.select().from(profilesTable).where(inArray(profilesTable.userId,coachLinks.map(c=>c.coachId)));
    profile.coachName=coaches.map(r=>UpdateProfileResponse.parse(r.data).name).join(", ");
  }
  return {demo:false,profile,programs:programRows.map(r=>normalizeProgram(SaveProgramResponse.parse(r.data))),athletes,
    assignments:assignmentRows.map(r=>{
      const assignment=AssignProgramResponse.parse(r.data);
      return {...assignment,program:normalizeProgram(assignment.program)};
    }),
    sessions,invitations:invitationRows.map(r=>({id:r.id,name:r.name,path:r.acceptedBy ? "" : `/join?token=${r.token}`,expiresAt:r.expiresAt.toISOString(),status:r.acceptedBy ? "accepted" as const : r.expiresAt.getTime()<Date.now() ? "expired" as const : "pending" as const}))};
}
