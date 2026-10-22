import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, like, sql } from "drizzle-orm";
import {
  db, usersTable, profilesTable, coachingTable, credentialsTable,
  passwordSetupsTable, invitationsTable, sessionsTable, workspaceMembersTable,
} from "@workspace/db";
import {
  CreatePasswordSetupBody, PasswordLoginBody, CompletePasswordSetupBody,
  GetPasswordSetupInfoBody, RegisterLifterBody,
} from "@workspace/api-zod";
import { isCoach, isAdmin } from "../lib/coach-access";
import { linked } from "../lib/training-store";
import { fail } from "../lib/training-types";
import { clearSession, getSessionId } from "../lib/auth";
import { authLimit, issuePasswordSession, passwordCredential } from "../lib/password-access";
import { hashPassword, hashSetupToken, normalizeUsername, verifyPassword } from "../lib/password-crypto";
import { PRIVATE_PREFIX } from "../lib/private-access";
import { workspaceId, workspaceUserIds } from "../lib/workspace-access";

const router = Router();
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
// Local/device sign-out must work for password and expired sessions without
// requiring the external OIDC provider to be configured or reachable.
router.post("/auth/device-logout", async (req, res) => {
  await clearSession(res, getSessionId(req));
  res.json({ success: true });
});

router.post("/auth/register", async (req,res)=>{
  await authLimit(req,"public-registration",10);
  if(req.user) fail(409,"Sign out before creating another account.");
  const input=RegisterLifterBody.parse(req.body);
  const username=normalizeUsername(input.username), name=input.name?.trim() || username;
  const id=randomUUID(), passwordHash=await hashPassword(input.password);
  try {
    await db.transaction(async tx=>{
      await tx.insert(usersTable).values({id,firstName:name});
      // Never accept workspace, role, group or user IDs from public requests.
      await tx.insert(workspaceMembersTable).values({userId:id,workspaceId:"team"});
      await tx.insert(profilesTable).values({userId:id,data:{id,name,unit:"lb",meetDate:"",squatMax:0,benchMax:0,deadliftMax:0,coachName:""}});
      await tx.insert(credentialsTable).values({userId:id,username,passwordHash});
    });
  } catch(error) {
    const e=error as {code?:string;cause?:{code?:string}};
    if(e.code==="23505" || e.cause?.code==="23505") fail(409,"That username is already taken. Choose another.");
    throw error;
  }
  await clearSession(res,getSessionId(req));
  await issuePasswordSession(res,id,0);
  res.json({success:true});
});

async function accounts(ids: string[]) {
  const rows = await db.select({
    userId: usersTable.id, firstName: usersTable.firstName,
    profile: profilesTable.data, username: credentialsTable.username,
    passwordHash: credentialsTable.passwordHash, setupExpiresAt: passwordSetupsTable.expiresAt,
  }).from(usersTable)
    .leftJoin(profilesTable, eq(profilesTable.userId, usersTable.id))
    .leftJoin(credentialsTable, eq(credentialsTable.userId, usersTable.id))
    .leftJoin(passwordSetupsTable, eq(passwordSetupsTable.userId, usersTable.id))
    .where(inArray(usersTable.id, ids));
  return rows.map(r => ({
    userId: r.userId, name: (r.profile as {name?: string} | null)?.name ?? r.firstName ?? "Athlete",
    username: r.username, passwordEnabled: Boolean(r.passwordHash),
    setupExpiresAt: r.setupExpiresAt && r.setupExpiresAt > new Date() ? r.setupExpiresAt.toISOString() : null,
  }));
}

router.get("/password-accounts", async (req, res) => {
  if (!req.user) fail(401, "Sign in first.");
  res.json(await accounts([req.user.id]));
});
router.get("/auth/password-account", async (req, res) => {
  if (!req.user) fail(401, "Sign in first.");
  const [account] = await accounts([req.user.id]);
  if (!account) fail(404, "Account not found.");
  res.json(account);
});

router.post("/password-accounts", async (req, res) => {
  if (!req.user) fail(401, "Sign in first.");
  const input = CreatePasswordSetupBody.parse(req.body);
  if(input.userId!==req.user.id) fail(403,"You may manage only your own password. Use a lifting-group invitation to add a lifter.");
  const coach = req.user.id;
  const scope = await workspaceId(coach);
  if(!await isCoach(coach) && input.userId!==coach) fail(403,"The admin may manage only their own password.");
  if (input.userId && !await linked(coach, input.userId)) fail(403, "Choose your account or an existing linked client.");
  const userId = input.userId ?? randomUUID();
  const username = input.username ? normalizeUsername(input.username) : "";
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  try {
    await db.transaction(async tx => {
      if (!input.userId) {
        const name = input.name?.trim() || "Invited client";
        await tx.insert(usersTable).values({ id: userId, firstName: name });
        await tx.insert(workspaceMembersTable).values({userId,workspaceId:scope});
        await tx.insert(profilesTable).values({
          userId, data: { id: userId, name, unit: "lb", meetDate: "", squatMax: 0, benchMax: 0, deadliftMax: 0, coachName: "" },
        });
        await tx.insert(coachingTable).values({ coachId: coach, athleteId: userId });
      }
      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).for("update");
      if (!user) fail(404, "Existing account not found.");
      const [existing] = await tx.select().from(credentialsTable).where(eq(credentialsTable.userId, userId));
      if (existing && username && existing.username !== username) fail(409, `Use this account's assigned username: ${existing.username}.`);
      if (!existing && username) await tx.insert(credentialsTable).values({ userId, username });
      // One outstanding link per account. Issuing a reset does NOT change the
      // current password or revoke current sessions until it is redeemed.
      await tx.insert(passwordSetupsTable).values({ userId, tokenHash: hashSetupToken(token), expiresAt })
        .onConflictDoUpdate({ target: passwordSetupsTable.userId, set: { tokenHash: hashSetupToken(token), expiresAt } });
    });
  } catch (error) {
    const e = error as {code?: string; cause?: {code?: string}};
    if (e.code === "23505" || e.cause?.code === "23505") fail(409, "That username is already assigned. Choose another.");
    throw error;
  }
  res.json({ userId, username, path: `/set-password#token=${token}`, expiresAt: expiresAt.toISOString() });
});

router.delete("/password-accounts/:userId/setup", async (req, res) => {
  if (!req.user) fail(401, "Sign in first.");
  const userId = req.params.userId as string;
  if(userId!==req.user.id) fail(403,"You may manage only your own password.");
  if (!await linked(req.user.id, userId)) fail(403, "Choose your account or a linked client.");
  await db.delete(passwordSetupsTable).where(eq(passwordSetupsTable.userId, userId));
  res.json({ success: true });
});

router.post("/auth/password-login", async (req, res) => {
  await authLimit(req, "login-ip", 50);
  const input = PasswordLoginBody.parse(req.body);
  const username = normalizeUsername(input.username);
  await authLimit(req, "login-username", 10, username);
  const [credential] = await db.select().from(credentialsTable).where(eq(credentialsTable.username, username));
  if (!await verifyPassword(input.password, credential?.passwordHash ?? null) || !credential) {
    fail(401, "Incorrect username or password.");
  }
  await clearSession(res, getSessionId(req));
  await issuePasswordSession(res, credential.userId, credential.version);
  res.json({ success: true });
});

router.post("/auth/password-setup-info", async (req, res) => {
  await authLimit(req, "setup-info-ip", 60);
  const { token } = GetPasswordSetupInfoBody.parse(req.body);
  const [setup] = await db.select().from(passwordSetupsTable)
    .where(and(eq(passwordSetupsTable.tokenHash, hashSetupToken(token)), gt(passwordSetupsTable.expiresAt, new Date())));
  const credential = setup ? await passwordCredential(setup.userId) : null;
  if (!setup) fail(410, "This link is invalid, expired, or already used. Ask your coach or admin for a new link.");
  const [profile]=await db.select().from(profilesTable).where(eq(profilesTable.userId,setup.userId));
  res.json({ username: credential?.username ?? "", chooseUsername:!credential, name:(profile?.data as {name?:string})?.name ?? "", expiresAt: setup.expiresAt.toISOString() });
});

router.post("/auth/password-setup", async (req, res) => {
  await authLimit(req, "setup-ip", 20);
  const { token, password, username:chosenUsername, name } = CompletePasswordSetupBody.parse(req.body);
  const tokenHash = hashSetupToken(token);
  const [candidate] = await db.select().from(passwordSetupsTable)
    .where(and(eq(passwordSetupsTable.tokenHash, tokenHash), gt(passwordSetupsTable.expiresAt, new Date())));
  if (!candidate) fail(410, "This link is invalid, expired, or already used. Ask your coach for a new link.");
  const passwordHash = await hashPassword(password);
  let credential;
  try { credential = await db.transaction(async tx => {
    // Serialize issuing and redeeming a link for this account. Re-check after
    // locking: concurrent redemptions must never both succeed.
    await tx.select().from(usersTable).where(eq(usersTable.id, candidate.userId)).for("update");
    const [setup] = await tx.delete(passwordSetupsTable)
      .where(and(eq(passwordSetupsTable.tokenHash, tokenHash), gt(passwordSetupsTable.expiresAt, new Date()))).returning();
    if (!setup) fail(410, "This link is invalid, expired, or already used. Ask your coach for a new link.");
    const [existing]=await tx.select().from(credentialsTable).where(eq(credentialsTable.userId,setup.userId));
    if (!existing) {
      if(!chosenUsername) fail(400,"Choose your username.");
      const username=normalizeUsername(chosenUsername);
      await tx.insert(credentialsTable).values({userId:setup.userId,username});
      const displayName=name?.trim() || username;
      await tx.update(usersTable).set({firstName:displayName}).where(eq(usersTable.id,setup.userId));
      await tx.update(profilesTable).set({data:sql`${profilesTable.data} || ${JSON.stringify({name:displayName})}::jsonb`}).where(eq(profilesTable.userId,setup.userId));
    } else if(chosenUsername && normalizeUsername(chosenUsername)!==existing.username) {
      fail(409,"This account already has a username. Password resets cannot change it.");
    }
    const [updated] = await tx.update(credentialsTable)
      .set({ passwordHash, version: sql`${credentialsTable.version} + 1` })
      .where(eq(credentialsTable.userId, setup.userId)).returning();
    if (!updated) fail(409, "Ask your coach to create a new setup link.");
    await tx.delete(invitationsTable).where(and(
      eq(invitationsTable.acceptedBy, setup.userId), like(invitationsTable.token, `${PRIVATE_PREFIX}%`),
    ));
    await tx.delete(sessionsTable).where(sql`${sessionsTable.sess}->'user'->>'id' = ${setup.userId}`);
    return updated;
  }); } catch(error) {
    const e=error as {code?:string;cause?:{code?:string}};
    if(e.code==="23505" || e.cause?.code==="23505") fail(409,"That username is already taken. Choose another; your invitation is still valid.");
    throw error;
  }
  await clearSession(res, getSessionId(req));
  await issuePasswordSession(res, credential.userId, credential.version);
  res.json({ success: true });
});

export default router;
