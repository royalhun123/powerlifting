import { Router, type Response } from "express";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { db, invitationsTable, usersTable, coachingTable, profilesTable } from "@workspace/db";
import { CreateAccessLinkBody, RedeemAccessLinkBody, BootstrapPrivateLoginBody } from "@workspace/api-zod";
import { isCoach } from "../lib/coach-access";
import { linked } from "../lib/training-store";
import { clearSession, createSession, getSessionId, SESSION_COOKIE } from "../lib/auth";
import { fail } from "../lib/training-types";
import { PRIVATE_PREFIX, PRIVATE_SESSION_TTL, hashPrivateToken, newPrivateToken, privateLoginEnabled } from "../lib/private-access";
import { authLimit, issuePasswordSession, passwordCredential } from "../lib/password-access";

const router=Router();
router.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
const metadata=(row:typeof invitationsTable.$inferSelect)=>({
  id:row.id,name:row.name,userId:row.acceptedBy!,expiresAt:row.expiresAt.toISOString(),
});
async function issueSession(res:Response,userId:string,linkId:string) {
  const [user]=await db.select().from(usersTable).where(eq(usersTable.id,userId));
  if(!user) fail(404,"Account not found. Ask your coach for a new link.");
  const sid=await createSession({user,access_token:"",provider:"private-link",privateLinkId:linkId});
  res.cookie(SESSION_COOKIE,sid,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:PRIVATE_SESSION_TTL});
}

router.get("/auth/mode",(_req,res)=>res.json({privateLogin:privateLoginEnabled()}));
router.post("/auth/private-link",async(req,res)=>{
  await authLimit(req, "private-link-ip", 30);
  const {token}=RedeemAccessLinkBody.parse(req.body);
  const [link]=await db.select().from(invitationsTable).where(eq(invitationsTable.token,hashPrivateToken(token)));
  if(!link?.acceptedBy || link.expiresAt.getTime()<=Date.now() || !isCoach(link.coachId)) fail(401,"This private link is invalid, revoked, or expired. Ask your coach for a new link.");
  if ((await passwordCredential(link.acceptedBy))?.passwordHash) fail(401, "This account now uses a username and password.");
  const old=getSessionId(req);
  if(old) await clearSession(res,old);
  await issueSession(res,link.acceptedBy,link.id);
  res.json({success:true});
});
// Optional recovery/setup route. The secret is configured by the owner, never
// derived from a public username, email address, or Replit project identifier.
router.post("/auth/bootstrap",async(req,res)=>{
  await authLimit(req, "coach-recovery-ip", 10);
  const {setupKey}=BootstrapPrivateLoginBody.parse(req.body);
  const configured=process.env.COACH_SETUP_KEY;
  const owner=process.env.COACH_USER_ID || process.env.COACH_REPLIT_USER_ID;
  if(!configured || configured.length<32 || !owner) fail(503,"Coach recovery has not been configured.");
  const digest=(s:string)=>createHash("sha256").update(s).digest();
  if(!timingSafeEqual(digest(setupKey),digest(configured))) fail(401,"Invalid setup key.");
  // Require the preserved owner account: never silently create a fresh owner
  // account against an empty/wrong database during migration.
  const [user]=await db.select().from(usersTable).where(eq(usersTable.id,owner));
  if(!user) fail(409,"The original coach account is missing. Restore the correct database before continuing.");
  const credential = await passwordCredential(owner);
  if (credential?.passwordHash) {
    await clearSession(res, getSessionId(req));
    await issuePasswordSession(res, owner, credential.version);
    res.json({success:true});return;
  }
  const token=newPrivateToken(),id=randomUUID(),expiresAt=new Date(Date.now()+180*86400000);
  await db.insert(invitationsTable).values({id,coachId:owner,acceptedBy:owner,name:"Coach recovery",token:hashPrivateToken(token),expiresAt});
  await clearSession(res,getSessionId(req));
  await issueSession(res,owner,id);
  res.json({success:true});
});

router.get("/access-links",async(req,res)=>{
  if(!req.user || !isCoach(req.user.id)) fail(403,"Coach access required.");
  const rows=await db.select().from(invitationsTable).where(and(eq(invitationsTable.coachId,req.user.id),like(invitationsTable.token,`${PRIVATE_PREFIX}%`)));
  res.json(rows.map(metadata));
});
router.post("/access-links",async(req,res)=>{
  if(!req.user || !isCoach(req.user.id)) fail(403,"Coach access required.");
  const input=CreateAccessLinkBody.parse(req.body);
  if(!input.userId && !input.name?.trim()) fail(400,"Enter a client name or select an existing account.");
  const coach=req.user.id;
  const target=input.userId || randomUUID();
  if(input.userId && !await linked(coach,target)) fail(403,"Choose your own account or an existing linked client.");
  if (input.userId && (await passwordCredential(target))?.passwordHash) fail(409, "This account uses a password. Create a one-time password reset link instead.");
  const token=newPrivateToken(),id=randomUUID(),expiresAt=new Date(Date.now()+180*86400000);
  const row=await db.transaction(async tx=>{
    let name=input.name?.trim() || "";
    if(!input.userId) {
      await tx.insert(usersTable).values({id:target,firstName:name});
      await tx.insert(profilesTable).values({userId:target,data:{id:target,name,unit:"lb",meetDate:"",squatMax:0,benchMax:0,deadliftMax:0,coachName:""}});
      await tx.insert(coachingTable).values({coachId:coach,athleteId:target});
    } else {
      const [profile]=await tx.select().from(profilesTable).where(eq(profilesTable.userId,target));
      const [user]=await tx.select().from(usersTable).where(eq(usersTable.id,target));
      if(!profile || !user) fail(404,"Existing account not found; do not create a duplicate to migrate history.");
      name=(profile.data as {name:string}).name;
    }
    const [saved]=await tx.insert(invitationsTable).values({id,coachId:coach,acceptedBy:target,name,token:hashPrivateToken(token),expiresAt}).returning();
    return saved!;
  });
  res.json({...metadata(row),path:`/sign-in#key=${token}`});
});
router.delete("/access-links/:id",async(req,res)=>{
  if(!req.user || !isCoach(req.user.id)) fail(403,"Coach access required.");
  const rows=await db.delete(invitationsTable).where(and(eq(invitationsTable.id,req.params.id as string),eq(invitationsTable.coachId,req.user.id),like(invitationsTable.token,`${PRIVATE_PREFIX}%`))).returning();
  if(!rows.length) fail(404,"Link not found.");
  res.json({success:true});
});
// Existing Replit login remains available only during the transition.
router.get("/login",(_req,res,next)=>privateLoginEnabled() ? res.redirect("/sign-in") : next());
router.get("/logout",async(req,res,next)=>{
  if(!privateLoginEnabled() && !req.user) {next();return;}
  await clearSession(res,getSessionId(req));
  res.redirect("/sign-in");
});
export default router;
