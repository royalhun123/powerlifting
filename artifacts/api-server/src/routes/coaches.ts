import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, profilesTable, coachingTable, coachesTable, credentialsTable, passwordSetupsTable } from "@workspace/db";
import { CreateCoachBody, ListCoachesResponse } from "@workspace/api-zod";
import { isAdmin } from "../lib/coach-access";
import { fail } from "../lib/training-types";
import { hashSetupToken, normalizeUsername } from "../lib/password-crypto";

const router = Router();
router.use("/coaches", (req,res,next)=>{
  res.setHeader("Cache-Control","no-store");
  if(!req.user || !isAdmin(req.user.id)) fail(403,"Administrator access required.");
  next();
});
router.get("/coaches", async (req,res)=>{
  const coaches = await db.select().from(coachesTable).where(eq(coachesTable.createdBy,req.user!.id));
  if (!coaches.length) {res.json([]);return;}
  const ids = coaches.map(c=>c.userId);
  const links = await db.select().from(coachingTable).where(inArray(coachingTable.coachId,ids));
  const profiles = await db.select().from(profilesTable).where(inArray(profilesTable.userId,[...ids,...links.map(l=>l.athleteId)]));
  const names = new Map(profiles.map(p=>[p.userId,(p.data as {name:string}).name]));
  const credentials = await db.select().from(credentialsTable).where(inArray(credentialsTable.userId,ids));
  res.json(ListCoachesResponse.parse(coaches.map(c=>{
    const credential = credentials.find(x=>x.userId===c.userId);
    return {userId:c.userId,name:names.get(c.userId)||"Coach",username:credential?.username||"",passwordEnabled:!!credential?.passwordHash,
      createdAt:c.createdAt.toISOString(),clients:links.filter(l=>l.coachId===c.userId).map(l=>({id:l.athleteId,name:names.get(l.athleteId)||"Athlete"}))};
  })));
});
router.post("/coaches", async(req,res)=>{
  const input = CreateCoachBody.parse(req.body);
  if(!input.userId && !input.name?.trim()) fail(400,"Enter a coach name.");
  const userId=input.userId || randomUUID(), username=normalizeUsername(input.username);
  const token=randomBytes(32).toString("base64url"), expiresAt=new Date(Date.now()+86400000);
  try {
    await db.transaction(async tx=>{
      if(input.userId) {
        // Admin may renew onboarding only, never reset a working coach account.
        const [coach]=await tx.select().from(coachesTable).where(eq(coachesTable.userId,userId));
        if(!coach || coach.createdBy!==req.user!.id) fail(403,"Not an invited coach.");
        await tx.select().from(usersTable).where(eq(usersTable.id,userId)).for("update");
        const [credential]=await tx.select().from(credentialsTable).where(eq(credentialsTable.userId,userId));
        if(!credential || credential.passwordHash || credential.username!==username) fail(403,"This coach manages their own account.");
      } else {
        const name=input.name!.trim();
        await tx.insert(usersTable).values({id:userId,firstName:name});
        await tx.insert(profilesTable).values({userId,data:{id:userId,name,unit:"lb",meetDate:"",squatMax:0,benchMax:0,deadliftMax:0,coachName:""}});
        await tx.insert(credentialsTable).values({userId,username});
        await tx.insert(coachesTable).values({userId,createdBy:req.user!.id});
      }
      await tx.insert(passwordSetupsTable).values({userId,tokenHash:hashSetupToken(token),expiresAt})
        .onConflictDoUpdate({target:passwordSetupsTable.userId,set:{tokenHash:hashSetupToken(token),expiresAt}});
    });
  } catch(error) {
    const e=error as {code?:string;cause?:{code?:string}};
    if(e.code==="23505" || e.cause?.code==="23505") fail(409,"That username is already assigned.");
    throw error;
  }
  res.json({userId,username,path:`/set-password#token=${token}`,expiresAt:expiresAt.toISOString()});
});
export default router;
