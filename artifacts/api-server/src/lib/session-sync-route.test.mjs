import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

// Exercise the REAL Express router and generated validators with a disposable,
// transaction-serialized, memory-only DB adapter. No server is started, no
// credentials/env are read, and no PostgreSQL/live data is touched.
const directory = await mkdtemp(join(dirname(fileURLToPath(import.meta.url)), ".sync-test-"));
const fixtureSource = `
export const fixture = { rows: new Map(), assignments: [], locks: 0 };
const table = name => Object.fromEntries(["id","athleteId","userId","ownerId","coachId"].map(field => [field,{name,field}]));
export const workoutsTable=table("sessions"), assignmentsTable=table("assignments");
export const profilesTable=table("profiles"), programsTable=table("programs"), coachingTable=table("links"), invitationsTable=table("invitations"), bodyweightsTable=table("bodyweights"), trueMaxesTable=table("maxes");
const matches = (row,predicate) => !predicate || (Array.isArray(predicate) ? predicate.every(p=>matches(row,p)) : row[predicate.column.field]===predicate.value);
const rows = t => t===workoutsTable ? [...fixture.rows.values()] : t===assignmentsTable ? fixture.assignments : [];
let tail=Promise.resolve();
export const db = {
  select() {
    let t,p;
    const query = { from(value){t=value;return query;}, where(value){p=value;return query;}, for(){return query;}, then(resolve,reject){return Promise.resolve(structuredClone(rows(t).filter(row=>matches(row,p)))).then(resolve,reject);} };
    return query;
  },
  insert(t) { return { async values(row){ if(fixture.rows.has(row.id)) throw new Error("duplicate key"); fixture.rows.set(row.id,structuredClone(row)); } }; },
  update(t) { return { set(patch){return { async where(predicate){ for(const row of rows(t)) if(matches(row,predicate)) Object.assign(row,structuredClone(patch)); } };} };},
  async execute(){fixture.locks++;},
  transaction(run){ const result=tail.then(()=>run(db)); tail=result.catch(()=>{}); return result; }
};
`;
try {
  const output = join(directory, "router.mjs");
  await build({
    stdin: {
      contents: `export {default} from "./routes/training.ts"; export {fixture} from "fixture-db"; export {demoWorkspace} from "./lib/demo.ts";`,
      resolveDir: join(dirname(fileURLToPath(import.meta.url)), ".."),
    },
    outfile: output, bundle: true, platform: "node", format: "esm", packages: "external",
    plugins: [{
      name: "isolated-development-fixtures",
      setup(builder) {
        builder.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../../lib/api-zod/src/index.ts") }));
        builder.onResolve({ filter: /^(@workspace\/db|fixture-db)$/ }, () => ({ path: "db", namespace: "fixture" }));
        builder.onResolve({ filter: /^drizzle-orm$/ }, () => ({ path: "drizzle", namespace: "fixture" }));
        builder.onResolve({ filter: /\/(training-store|workspace-access|coach-access)$/ }, args => ({ path: args.path.split("/").pop(), namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
          contents: args.path === "db" ? fixtureSource :
            args.path === "drizzle" ? `export const eq=(column,value)=>({column,value});export const and=(...conditions)=>conditions;export const sql=(strings,...values)=>({strings,values});` :
            args.path === "training-store" ? `export const ensureProfile=async()=>({name:"Fixture Lifter"});export const linked=async()=>false;export const loadWorkspace=async()=>({});` :
            args.path === "workspace-access" ? `export const workspaceId=async()=>"fixture-workspace";export const sameWorkspace=async()=>true;` :
            `export const isCoach=async()=>false;export const isAdmin=async()=>false;`,
          loader: "js",
        }));
      },
    }],
  });
  const { default: router, fixture, demoWorkspace } = await import(pathToFileURL(output).href);
  const assignment = structuredClone(demoWorkspace().assignments[0]);
  assignment.id = "fixture-assignment"; assignment.athleteId = "fixture-user";
  assignment.archived = false; assignment.removed = false;
  fixture.assignments.push({ id: assignment.id, athleteId: assignment.athleteId, data: assignment });
  const workout = assignment.program.workouts[0], exercise = workout.exercises[0];
  const input = () => ({
    id: randomUUID(), assignmentId: assignment.id, workoutId: workout.id,
    name: workout.name, date: "2026-01-01", unit: "lb", status: "draft", notes: "",
    sets: [{ exerciseId: exercise.id, exerciseName: exercise.name, lift: exercise.lift, setNumber: 1, weight: 100, reps: 5, rpe: 8, completed: true, notes: "" }],
  });
  const headers = (mutation, expected = "new") => ({
    "x-session-sync": "1", "x-mutation-id": mutation, "x-expected-updated-at": expected, "x-workspace-id": "fixture-workspace",
  });
  function request(body, requestHeaders = {}, user = "fixture-user", method = "POST", url = "/sessions") {
    return new Promise(resolve => {
      let status = 200;
      const responseHeaders = {};
      const response = { setHeader(key, value) { responseHeaders[key] = value; }, status(value) { status = value; return response; }, json(value) { resolve({ status, body: value, headers: responseHeaders }); } };
      const req = { method, url, path: url, headers: requestHeaders, body, user: user ? { id: user, firstName: "Fixture" } : undefined, isAuthenticated: () => !!user, get: key => requestHeaders[key.toLowerCase()] };
      router.handle(req, response, error => resolve({ status: error?.status ?? 500, body: { error: error?.message ?? "No matching handler" }, headers: responseHeaders }));
    });
  }
  await test("real session route: concurrent duplicate creation inserts exactly once", async () => {
    const data = input(), mutation = randomUUID();
    const [first, replay] = await Promise.all([request(data, headers(mutation)), request(data, headers(mutation))]);
    assert.equal(first.status, 200); assert.equal(replay.status, 200);
    assert.deepEqual(first.body, replay.body);
    assert.equal(fixture.rows.size, 1);
    assert.ok(fixture.locks >= 1, "Creation path takes advisory transaction locks");
  });
  await test("real route rejects stale revision and reused mutation payload", async () => {
    const data = input(), mutation = randomUUID();
    const first = await request(data, headers(mutation));
    const update = await request({ ...data, notes: "online edit" }, headers(randomUUID(), first.body.updatedAt));
    assert.equal(update.status, 200);
    assert.equal((await request({ ...data, notes: "stale edit" }, headers(randomUUID(), first.body.updatedAt))).status, 409);
    assert.equal((await request({ ...data, notes: "changed replay" }, headers(mutation))).status, 409);
    assert.equal(fixture.rows.get(data.id).data.notes, "online edit");
  });
  await test("replayed acknowledgement preserves original revision across later server edits", async () => {
    const data = input(), mutation = randomUUID();
    const first = await request(data, headers(mutation));
    const second = await request({ ...data, notes: "other server edit" }, headers(randomUUID(), first.body.updatedAt));
    const replay = await request(data, headers(mutation));
    assert.equal(replay.body.updatedAt, second.body.updatedAt);
    assert.equal(replay.headers["X-Acknowledged-Updated-At"], first.body.updatedAt);
    assert.equal((await request({ ...data, status: "completed" }, headers(randomUUID(), replay.headers["X-Acknowledged-Updated-At"]))).status, 409);
  });
  await test("wrong account/workspace and expired auth cannot sync", async () => {
    const data = input();
    assert.equal((await request(data, headers(randomUUID()), null)).status, 401);
    assert.equal((await request(data, headers(randomUUID()), "other-user")).status, 403);
    assert.equal((await request(data, { ...headers(randomUUID()), "x-workspace-id": "wrong-workspace" })).status, 409);
  });
  await test("lost acknowledgement can be recovered after an assignment is archived", async () => {
    const data = input(), mutation = randomUUID();
    const first = await request(data, headers(mutation));
    fixture.assignments[0].data.archived = true;
    try {
      const replay = await request(data, headers(mutation));
      assert.equal(replay.status, 200);
      assert.equal(replay.headers["X-Acknowledged-Updated-At"], first.body.updatedAt);
    } finally { fixture.assignments[0].data.archived = false; }
  });
  await test("legacy ID updates remain updates; sync stable IDs can create", async () => {
    const data = input();
    assert.equal((await request(data)).status, 404);
    const created = await request(data, headers(randomUUID()));
    assert.equal(created.status, 200);
    const legacy = await request({ ...data, notes: "legacy edit" });
    assert.equal(legacy.status, 200);
    assert.equal(legacy.body.id, data.id);
  });
  await test("deleted stable IDs cannot resurrect after an ambiguous create response", async () => {
    const data = input(), mutation = randomUUID();
    assert.equal((await request(data, headers(mutation))).status, 200);
    assert.equal((await request(undefined, {}, "fixture-user", "DELETE", `/sessions/${data.id}`)).status, 200);
    assert.deepEqual(fixture.rows.get(data.id).data, { _deleted: true });
    assert.equal((await request(data, headers(mutation))).status, 409);
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
