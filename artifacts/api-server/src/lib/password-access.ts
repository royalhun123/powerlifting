import type { Request, Response } from "express";
import { db, authLimitsTable, credentialsTable, usersTable } from "@workspace/db";
import { eq, lt, sql } from "drizzle-orm";
import { createSession, SESSION_COOKIE } from "./auth";
import { PRIVATE_SESSION_TTL } from "./private-access";
import { hashSetupToken } from "./password-crypto";
import { fail } from "./training-types";

export async function passwordCredential(userId: string) {
  const [row] = await db.select().from(credentialsTable).where(eq(credentialsTable.userId, userId));
  return row;
}

// Database-backed limits survive cold starts and apply across Vercel instances.
// Count all attempts before expensive hashing, not only failed requests.
export async function authLimit(req: Request, scope: string, max: number, identity?: string) {
  const key = hashSetupToken(`${scope}:${identity ?? req.ip ?? "unknown"}`);
  await db.delete(authLimitsTable).where(lt(authLimitsTable.expiresAt, new Date(Date.now() - 86400000)));
  const [row] = await db.insert(authLimitsTable).values({
    key, attempts: 1, expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  }).onConflictDoUpdate({
    target: authLimitsTable.key,
    set: {
      attempts: sql`CASE WHEN ${authLimitsTable.expiresAt} <= now() THEN 1 ELSE ${authLimitsTable.attempts} + 1 END`,
      expiresAt: sql`CASE WHEN ${authLimitsTable.expiresAt} <= now() THEN now() + interval '15 minutes' ELSE ${authLimitsTable.expiresAt} END`,
    },
  }).returning();
  if (!row || row.attempts > max) fail(429, "Too many attempts. Please wait 15 minutes before trying again.");
}

export async function issuePasswordSession(res: Response, userId: string, version: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) fail(401, "Account unavailable.");
  const sid = await createSession({ user, access_token: "", provider: "password", credentialVersion: version });
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: PRIVATE_SESSION_TTL,
  });
}
