// Run only against the managed development DB:
// TEST_PASSWORD_AUTH=development node scripts/test-password-auth.mjs
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
if (process.env.TEST_PASSWORD_AUTH !== "development" || process.env.VERCEL) {
  throw new Error("This fixture-writing test requires TEST_PASSWORD_AUTH=development outside Vercel.");
}
const requireDb = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const owner = `password-test-${randomUUID()}`, usernames = [];
const ids = [owner];
const ip = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const digest = s => createHash("sha256").update(s).digest("hex");
const password = randomBytes(24).toString("base64url"), nextPassword = randomBytes(24).toString("base64url");
process.env.COACH_USER_ID = owner;
process.env.AUTH_MODE = "private-link";
process.env.NODE_ENV = "production";
const { default: app } = await import("../artifacts/api-server/dist/app.mjs");
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
async function request(path, body, cookie, method = body ? "POST" : "GET") {
  const response = await fetch(base + path, {
    method, headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  const cookies = response.headers.getSetCookie();
  return { status: response.status, data, cookie: cookies.filter(c => c.startsWith("sid=")).at(-1)?.split(";")[0] };
}
const tokenFrom = result => new URLSearchParams(result.data.path.split("#")[1]).get("token");
const username = () => { const name = `test_${randomBytes(6).toString("hex")}`; usernames.push(name); return name; };
try {
  await pool.query("INSERT INTO users (id, first_name) VALUES ($1, 'TEST PASSWORD COACH')", [owner]);
  const rawLegacy = randomBytes(32).toString("base64url"), legacyId = randomUUID(), sid = randomBytes(32).toString("hex");
  await pool.query("INSERT INTO coaching_invitations (id,coach_id,name,token,accepted_by,expires_at) VALUES ($1,$2,'TEST',$3,$2,now()+interval '1 hour')",
    [legacyId, owner, "private:" + digest(rawLegacy)]);
  await pool.query("INSERT INTO sessions (sid,sess,expire) VALUES ($1,$2,now()+interval '1 hour')", [sid, JSON.stringify({
    provider: "private-link", privateLinkId: legacyId, access_token: "",
    user: { id: owner, email: null, firstName: "TEST PASSWORD COACH", lastName: null, profileImageUrl: null },
  })]);
  let coachCookie = `sid=${sid}`;
  const coachName = username();
  const setup = await request("/password-accounts", { userId: owner, username: coachName }, coachCookie);
  assert.equal(setup.status, 200);
  const signedCoach = await request("/auth/password-setup", { token: tokenFrom(setup), password });
  assert.equal(signedCoach.status, 200);
  coachCookie = signedCoach.cookie;
  assert.equal((await request("/workspace", null, coachCookie)).data.isCoach, true);
  assert.equal((await request("/auth/private-link", { token: rawLegacy })).status, 401);
  const coachAgain = await request("/auth/password-login", { username: coachName.toUpperCase(), password });
  assert.equal(coachAgain.status, 200);
  assert.equal((await request("/workspace", null, coachAgain.cookie)).data.isCoach, true);
  const clientName = username();
  const client = await request("/password-accounts", { name: "TEST PASSWORD CLIENT", username: clientName }, coachCookie);
  assert.equal(client.status, 200); ids.push(client.data.userId);
  const before = (await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n;
  assert.equal((await request("/password-accounts", { name: "TEST DUPLICATE", username: clientName.toUpperCase() }, coachCookie)).status, 409);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n, before);
  const legacyClient = await request("/access-links", { userId: client.data.userId }, coachCookie);
  assert.equal(legacyClient.status, 200);
  const token = tokenFrom(client);
  assert.equal((await request("/auth/password-setup-info", { token })).status, 200);
  const competing = await Promise.all([1, 2].map(() => request("/auth/password-setup", { token, password })));
  assert.deepEqual(competing.map(r => r.status).sort(), [200, 410]);
  const clientCookie = competing.find(r => r.status === 200).cookie;
  assert.equal((await request("/password-accounts", null, clientCookie)).status, 403);
  assert.equal((await request("/password-accounts", { name: "forbidden", username: username() }, clientCookie)).status, 403);
  const legacyKey = new URLSearchParams(legacyClient.data.path.split("#")[1]).get("key");
  assert.equal((await request("/auth/private-link", { token: legacyKey })).status, 401);
  assert.equal((await request("/access-links", { userId: client.data.userId }, coachCookie)).status, 409);
  const reset = await request("/password-accounts", { userId: client.data.userId, username: clientName }, coachCookie);
  assert.equal((await request("/auth/password-login", { username: clientName, password })).status, 200);
  const replacement = await request("/password-accounts", { userId: client.data.userId, username: clientName }, coachCookie);
  assert.equal((await request("/auth/password-setup", { token: tokenFrom(reset), password: nextPassword })).status, 410);
  const changed = await request("/auth/password-setup", { token: tokenFrom(replacement), password: nextPassword });
  assert.equal(changed.status, 200);
  assert.equal((await request("/auth/user", null, clientCookie)).data.user, null);
  assert.equal((await request("/auth/password-login", { username: clientName, password })).status, 401);
  assert.equal((await request("/auth/password-login", { username: clientName, password: nextPassword })).status, 200);
  assert.equal((await request("/auth/user", null, changed.cookie)).data.user.id, client.data.userId);
  const expired = await request("/password-accounts", { userId: client.data.userId, username: clientName }, coachCookie);
  await pool.query("UPDATE password_setups SET expires_at=now()-interval '1 minute' WHERE user_id=$1", [client.data.userId]);
  assert.equal((await request("/auth/password-setup", { token: tokenFrom(expired), password })).status, 410);
  const cancelled = await request("/password-accounts", { userId: client.data.userId, username: clientName }, coachCookie);
  assert.equal((await request(`/password-accounts/${client.data.userId}/setup`, null, coachCookie, "DELETE")).status, 200);
  assert.equal((await request("/auth/password-setup-info", { token: tokenFrom(cancelled) })).status, 410);
  const attackName = username();
  for (let i = 0; i < 10; i++) assert.equal((await request("/auth/password-login", { username: attackName, password })).status, 401);
  assert.equal((await request("/auth/password-login", { username: attackName, password })).status, 429);
  const unchanged = await pool.query("SELECT count(*)::int AS n FROM users WHERE id=ANY($1::text[])", [ids]);
  assert.equal(unchanged.rows[0].n, 2);
  console.log("PASS: coach/client login, preservation of IDs, duplicate rollback, concurrent single-use, resets, expiry, revocation, legacy retirement, session invalidation, persistent throttling.");
} finally {
  // Only identifiers generated by this run are eligible for cleanup.
  for (const table of ["password_setups", "password_credentials", "training_profiles"]) {
    await pool.query(`DELETE FROM ${table} WHERE user_id=ANY($1::text[])`, [ids]);
  }
  await pool.query("DELETE FROM sessions WHERE sess->'user'->>'id'=ANY($1::text[])", [ids]);
  await pool.query("DELETE FROM coaching_invitations WHERE coach_id=ANY($1::text[]) OR accepted_by=ANY($1::text[])", [ids]);
  await pool.query("DELETE FROM coaching_links WHERE coach_id=ANY($1::text[]) OR athlete_id=ANY($1::text[])", [ids]);
  await pool.query("DELETE FROM training_programs WHERE owner_id=ANY($1::text[])", [ids]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::text[])", [ids]);
  const keys = ["login-ip", "setup-ip", "setup-info-ip", "private-link-ip", "coach-recovery-ip"].map(scope => digest(`${scope}:${ip}`));
  keys.push(...usernames.map(name => digest(`login-username:${name}`)));
  await pool.query("DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])", [keys]);
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await pool.end();
}
