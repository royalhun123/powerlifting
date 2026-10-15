import { db, coachesTable, administrationTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/** Dedicated team administrator after explicit handoff; usernames never confer authority. */
export async function isAdmin(id: string): Promise<boolean> {
  const [administration] = await db.select().from(administrationTable).where(eq(administrationTable.id,"team"));
  if(administration) return administration.userId===id;
  const owner = process.env.COACH_USER_ID || process.env.COACH_REPLIT_USER_ID;
  return Boolean(owner && id === owner);
}

export async function isCoach(id: string): Promise<boolean> {
  const owner = process.env.COACH_USER_ID || process.env.COACH_REPLIT_USER_ID;
  if (id===owner) return true;
  const [coach] = await db.select().from(coachesTable).where(eq(coachesTable.userId, id));
  return Boolean(coach);
}
