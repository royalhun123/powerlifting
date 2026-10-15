import { db, coachesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/** Original account remains the only administrator; usernames are not authority. */
export function isAdmin(id: string): boolean {
  const owner = process.env.COACH_USER_ID || process.env.COACH_REPLIT_USER_ID;
  return Boolean(owner && id === owner);
}

export async function isCoach(id: string): Promise<boolean> {
  if (isAdmin(id)) return true;
  const [coach] = await db.select().from(coachesTable).where(eq(coachesTable.userId, id));
  return Boolean(coach);
}
