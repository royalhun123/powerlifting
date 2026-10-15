import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { createPrivateAdmin } from "./private-workspace.mjs";

if (process.env.TEST_LIFTING_GROUPS !== "development" ||
    process.env.NODE_ENV !== "development" || process.env.VERCEL) {
  throw new Error("Refusing to run: set TEST_LIFTING_GROUPS=development in a development environment.");
}
const dbUrl = new URL(process.env.DATABASE_URL || "postgres://invalid");
if (!process.env.DATABASE_URL || /neon|production/i.test(dbUrl.hostname)) {
  throw new Error("Refusing to run against a live/Neon database.");
}
const require = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const workspaceId = `test-lifting-${suffix}`;
const workspaceIds = [workspaceId];
const username = `lgadmin${suffix}`;
const password = `GroupTest-${suffix}-Pass!`;
const testIp = `198.18.${parseInt(suffix.slice(0, 2), 16)}.${parseInt(suffix.slice(2, 4), 16)}`;
const userIds = new Set();
let server;

function check(ok, message) { assert.ok(ok, message); }
async function request(base, path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": testIp,
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const sid = response.headers.getSetCookie?.().filter(c => c.startsWith("sid=")).at(-1)?.split(";")[0];
  return { status: response.status, data, cookie: sid || cookie };
}
async function setPassword(base, path, name) {
  const token = new URL(`http://dev${path}`).hash.slice(1).replace(/^token=/, "");
  const setup = await request(base, "/auth/password-setup", {
    method: "POST", body: { token, username: name, name, password },
  });
  assert.equal(setup.status, 200, JSON.stringify(setup.data));
  return setup.cookie;
}
async function trainingRecords(base, cookie, userId, label) {
  const program = await request(base, "/programs", {
    method: "POST", cookie,
    body: {
      name: `Test program ${label}`, description: "Isolated regression fixture",
      phase: "strength", weeks: 1, archived: false,
      workouts: [{ id: `workout-${label}`, name: "Squat day", week: 1, day: 1, exercises: [{
        id: `squat-${label}`, name: "Back Squat", sets: "1", reps: "5", effort: "RPE 7",
        weight: "225", notes: "Program prescription", review: false, lift: "squat",
      }]}],
    },
  });
  assert.equal(program.status, 200, JSON.stringify(program.data));
  const assignment = await request(base, "/assignments", {
    method: "POST", cookie, body: { programId: program.data.id, athleteId: userId, startDate: "2026-02-10" },
  });
  assert.equal(assignment.status, 200, JSON.stringify(assignment.data));
  const session = await request(base, "/sessions", {
    method: "POST", cookie,
    body: {
      assignmentId: assignment.data.id, workoutId: `workout-${label}`, name: "Squat day",
      date: "2026-02-11", unit: "lb", status: "completed", notes: `Session note ${label}`,
      sets: [{ exerciseId: `squat-${label}`, exerciseName: "Back Squat", lift: "squat", setNumber: 1,
        weight: 225, reps: 5, rpe: 7, completed: true, notes: `Set note ${label}` }],
    },
  });
  assert.equal(session.status, 200, JSON.stringify(session.data));
  assert.equal((await request(base, "/bodyweights", { method: "POST", cookie,
    body: { date: "2026-02-11", weight: 180, unit: "lb", timeOfDay: "morning" } })).status, 200);
  assert.equal((await request(base, "/maxes", { method: "POST", cookie,
    body: { date: "2026-02-11", lift: "squat", weight: 315, unit: "lb" } })).status, 200);
  return { programId: program.data.id, assignmentId: assignment.data.id, session: session.data };
}
async function trainingFingerprint(ids) {
  const specs = [
    ["training_programs", "owner_id=ANY($1::text[])", ids],
    ["training_assignments", "(athlete_id=ANY($1::text[]) OR coach_id=ANY($1::text[]))", ids],
    ["training_sessions", "athlete_id=ANY($1::text[])", ids],
    ["training_bodyweights", "athlete_id=ANY($1::text[])", ids],
    ["training_true_maxes", "athlete_id=ANY($1::text[])", ids],
  ];
  const data = {};
  for (const [table, where, values] of specs) {
    data[table] = (await pool.query(`SELECT row_to_json(t)::text AS row FROM ${table} t WHERE ${where} ORDER BY 1`, [values])).rows.map(r => r.row);
  }
  return data;
}

try {
  const admin = await createPrivateAdmin(pool, {
    workspaceId, workspaceName: `Disposable lifting test ${suffix}`,
    username, name: `Test Admin ${suffix}`,
  });
  userIds.add(admin.userId);
  process.env.AUTH_MODE = "private-link";
  const { default: app } = await import("../artifacts/api-server/dist/app.mjs");
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const adminCookie = await setPassword(base, admin.path, username);
  const adminWorkspace = await request(base, "/workspace", { cookie: adminCookie });
  assert.equal(adminWorkspace.status, 200);
  assert.equal(adminWorkspace.data.isAdmin, true);
  const directory = await request(base, "/coaches", { cookie: adminCookie });
  assert.equal(directory.status, 200);

  const invited = await request(base, "/coaches", {
    method: "POST", cookie: adminCookie, body: {},
  });
  assert.equal(invited.status, 200, JSON.stringify(invited.data));
  userIds.add(invited.data.userId);
  const lifterUsername = `lifter${suffix}`;
  const lifterCookie = await setPassword(base, invited.data.path, lifterUsername);
  const lifter = await request(base, "/workspace", { cookie: lifterCookie });
  assert.equal(lifter.status, 200);
  assert.equal(lifter.data.isLifter, true);

  const group = await request(base, "/groups", {
    method: "POST", cookie: lifterCookie, body: { name: `Test group ${suffix}` },
  });
  assert.equal(group.status, 200, JSON.stringify(group.data));
  const groupList = await request(base, "/groups", { cookie: lifterCookie });
  assert.equal(groupList.status, 200);
  assert.equal(groupList.data.length, 1);
  assert.equal(groupList.data[0].leaderId, invited.data.userId);
  const listed = await request(base, "/coaches", { cookie: adminCookie });
  assert.equal(listed.status, 200);
  assert.equal(listed.data.find(row => row.userId === invited.data.userId)?.groupName, `Test group ${suffix}`);
  assert.equal((await request(base, `/coaches/athletes/${invited.data.userId}/sessions`, { cookie: adminCookie })).status, 200);

  const invitation = await request(base, "/groups/invitations", {
    method: "POST", cookie: lifterCookie, body: {},
  });
  assert.equal(invitation.status, 200, JSON.stringify(invitation.data));
  const token = new URL(`http://dev${invitation.data.path}`).hash.slice(1).replace(/^token=/, "");
  const info = await request(base, "/groups/invitations/info", {
    method: "POST", body: { token },
  });
  assert.equal(info.status, 200);
  assert.equal(info.data.name, `Test group ${suffix}`);

  const collision = await request(base, "/groups/invitations/accept", {
    method: "POST", body: { token, username: lifterUsername, name: "Collision", password },
  });
  assert.equal(collision.status, 409, JSON.stringify(collision.data));
  const accepted = await request(base, "/groups/invitations/accept", {
    method: "POST", body: { token, username: `member${suffix}`, name: "Test Member", password },
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  const memberCookie = accepted.cookie;
  const memberWorkspace = await request(base, "/workspace", { cookie: memberCookie });
  assert.equal(memberWorkspace.status, 200);
  userIds.add(memberWorkspace.data.profile.id);
  const memberId = memberWorkspace.data.profile.id;
  const secondGroupDenied = await request(base, "/groups", {
    method: "POST", cookie: memberCookie, body: { name: "Second group" },
  });
  assert.equal(secondGroupDenied.status, 409);
  const leaderRows = await trainingRecords(base, lifterCookie, invited.data.userId, "leader");
  const memberRows = await trainingRecords(base, memberCookie, memberId, "member");
  const thread = await request(base, `/sessions/${memberRows.session.id}/discussion`, {
    method: "POST", cookie: memberCookie,
    body: { text: "Member discussion fixture", clientMessageId: randomUUID(), scope: "workout" },
  });
  assert.equal(thread.status, 200, JSON.stringify(thread.data));
  const feedback = await request(base, `/sessions/${memberRows.session.id}/feedback`, {
    method: "PATCH", cookie: lifterCookie, body: { feedback: "Leader session note fixture" },
  });
  assert.equal(feedback.status, 200, JSON.stringify(feedback.data));
  const sessionView = await request(base, "/workspace", { cookie: lifterCookie });
  assert.equal(sessionView.status, 200);
  assert.equal(sessionView.data.sessions.some(s => s.id === memberRows.session.id && s.notes === "Session note member"), true);
  assert.equal(sessionView.data.athletes.find(a => a.id === memberId)?.sessions, 1);
  assert.equal((await request(base, `/athletes/${memberId}/bodyweights`, { cookie: lifterCookie })).data[0].weight, 180);
  assert.equal((await request(base, `/athletes/${memberId}/true-maxes`, { cookie: lifterCookie })).data[0].weight, 315);
  const discussionView = await request(base, `/sessions/${memberRows.session.id}/discussion`, { cookie: lifterCookie });
  assert.equal(discussionView.status, 200);
  assert.equal(discussionView.data.threads[0].messages[0].text, "Member discussion fixture");
  const fingerprintsBeforeLeave = await trainingFingerprint([memberId, invited.data.userId]);

  const adminWrites = [
    ["/profile", "PATCH"], ["/bodyweights", "POST"], ["/maxes", "POST"],
    ["/programs", "POST"], ["/assignments", "POST"], ["/sessions", "POST"],
  ];
  for (const [path, method] of adminWrites) {
    const denied = await request(base, path, { method, cookie: adminCookie, body: {} });
    assert.equal(denied.status, 403, `Admin training write ${method} ${path}: ${JSON.stringify(denied.data)}`);
  }
  assert.equal((await request(base, "/groups/current", { method: "DELETE", cookie: adminCookie })).status, 403);

  const secondWorkspaceId = `test-lifting-${suffix}-other`;
  workspaceIds.push(secondWorkspaceId);
  const secondAdmin = await createPrivateAdmin(pool, {
    workspaceId: secondWorkspaceId, workspaceName: `Disposable cross-workspace test ${suffix}`,
    username: `lgadmin2${suffix}`, name: `Test Admin 2 ${suffix}`,
  });
  userIds.add(secondAdmin.userId);
  const secondAdminCookie = await setPassword(base, secondAdmin.path, `lgadmin2${suffix}`);
  const otherLifter = await request(base, "/coaches", {
    method: "POST", cookie: secondAdminCookie, body: {},
  });
  assert.equal(otherLifter.status, 200);
  userIds.add(otherLifter.data.userId);
  const otherCookie = await setPassword(base, otherLifter.data.path, `other${suffix}`);
  const otherGroup = await request(base, "/groups", {
    method: "POST", cookie: otherCookie, body: { name: `Other group ${suffix}` },
  });
  assert.equal(otherGroup.status, 200);
  const otherInvite = await request(base, "/groups/invitations", {
    method: "POST", cookie: otherCookie, body: {},
  });
  assert.equal(otherInvite.status, 200);
  const otherToken = new URL(`http://dev${otherInvite.data.path}`).hash.slice(1).replace(/^token=/, "");
  const crossWorkspace = await request(base, "/groups/invitations/accept", {
    method: "POST", cookie: memberCookie, body: { token: otherToken },
  });
  assert.equal(crossWorkspace.status, 403, JSON.stringify(crossWorkspace.data));
  assert.equal((await request(base, "/groups/leave", { method: "POST", cookie: memberCookie, body: {} })).status, 200);
  assert.deepEqual(await trainingFingerprint([memberId, invited.data.userId]), fingerprintsBeforeLeave);
  assert.equal((await request(base, "/workspace", { cookie: memberCookie })).data.sessions.some(s => s.id === memberRows.session.id), true);
  assert.equal((await request(base, `/athletes/${memberId}/bodyweights`, { cookie: lifterCookie })).status, 403);
  const rejoinInvite = await request(base, "/groups/invitations", { method: "POST", cookie: lifterCookie, body: {} });
  const rejoinToken = new URL(`http://dev${rejoinInvite.data.path}`).hash.slice(1).replace(/^token=/, "");
  assert.equal((await request(base, "/groups/invitations/accept", {
    method: "POST", cookie: memberCookie, body: { token: rejoinToken },
  })).status, 200);
  assert.equal((await request(base, "/groups/current", { method: "DELETE", cookie: memberCookie })).status, 403);
  const beforeDelete = await trainingFingerprint([memberId, invited.data.userId]);
  assert.equal((await request(base, `/groups/members/${memberId}`, {method:"DELETE",cookie:adminCookie})).status,403);
  assert.equal((await request(base, `/groups/members/${invited.data.userId}`, {method:"DELETE",cookie:memberCookie})).status,403);
  assert.equal((await request(base, `/groups/members/${invited.data.userId}`, {method:"DELETE",cookie:lifterCookie})).status,403);
  assert.equal((await request(base, `/groups/members/${memberId}`, {method:"DELETE",cookie:lifterCookie})).status,200);
  assert.deepEqual(await trainingFingerprint([memberId,invited.data.userId]),beforeDelete);
  assert.equal((await request(base, `/athletes/${memberId}/bodyweights`, {cookie:lifterCookie})).status,403);
  assert.deepEqual(beforeDelete, fingerprintsBeforeLeave);
  assert.equal((await request(base, "/groups/current", { method: "DELETE", cookie: lifterCookie })).status, 200);
  assert.deepEqual(await trainingFingerprint([memberId, invited.data.userId]), beforeDelete);
  assert.equal((await request(base, "/workspace", { cookie: memberCookie })).data.sessions.some(s => s.id === memberRows.session.id), true);
  assert.equal((await request(base, "/workspace", { cookie: lifterCookie })).data.sessions.some(s => s.id === leaderRows.session.id), true);
  assert.equal((await request(base, `/athletes/${memberId}/true-maxes`, { cookie: lifterCookie })).status, 403);

  assert.equal((await request(base, "/groups", { cookie: adminCookie })).data.length, 0);
  const afterLeaveGroup = await request(base, "/groups", {
    method: "POST", cookie: memberCookie, body: { name: "Post-leave group" },
  });
  assert.equal(afterLeaveGroup.status, 200, JSON.stringify(afterLeaveGroup.data));
  assert.equal((await request(base, "/groups", { method: "POST", cookie: adminCookie, body: { name: "Admin group" } })).status, 403);
  assert.equal((await request(base, "/password-accounts", { cookie: adminCookie })).data.length, 1);
  assert.equal((await request(base, "/access-links", { method: "GET", cookie: lifterCookie })).status, 410);
  assert.equal((await request(base, "/password-accounts", { method: "POST", cookie: adminCookie, body: { name: "Legacy client" } })).status, 403);
  console.log("PASS: isolated admin/lifter setup, ordinary lifter invite, one-member group, invite signup, username-collision retry, one-group restriction, admin group write denial, and legacy access-link/password-account guard.");
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  const ids = [...userIds];
  if (ids.length) {
    for (const scope of workspaceIds) {
      await pool.query("DELETE FROM lifting_group_invites WHERE group_id IN (SELECT id FROM lifting_groups WHERE workspace_id=$1)", [scope]);
      await pool.query("DELETE FROM lifting_group_members WHERE group_id IN (SELECT id FROM lifting_groups WHERE workspace_id=$1)", [scope]);
      await pool.query("DELETE FROM lifting_groups WHERE workspace_id=$1", [scope]);
    }
    await pool.query("DELETE FROM coaching_invitations WHERE coach_id=ANY($1::text[]) OR accepted_by=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM training_sessions WHERE athlete_id=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM training_assignments WHERE athlete_id=ANY($1::text[]) OR coach_id=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM training_programs WHERE owner_id=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM training_bodyweights WHERE athlete_id=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM training_true_maxes WHERE athlete_id=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM coaching_links WHERE coach_id=ANY($1::text[]) OR athlete_id=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM app_coaches WHERE user_id=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM password_setups WHERE user_id=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM password_credentials WHERE user_id=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM training_profiles WHERE user_id=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM app_administration WHERE user_id=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM app_workspace_members WHERE user_id=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM sessions WHERE sess->'user'->>'id'=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM users WHERE id=ANY($1::text[])", [ids]);
  }
  await pool.query("DELETE FROM app_workspaces WHERE id=ANY($1::text[])", [workspaceIds]);
  const limitKeys = ["setup-info-ip", "setup-ip", "group-info", "group-accept"].map(scope =>
    createHash("sha256").update(`${scope}:${testIp}`).digest("hex"));
  await pool.query("DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])", [limitKeys]);
  await pool.end();
}
