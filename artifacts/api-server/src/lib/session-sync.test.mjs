import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { sessionSyncDecision } from "./session-sync.ts";

// Disposable, memory-only development fixture. No environment variables, database
// connections, live accounts, or existing workout rows are read or modified.
function fixture() {
  let row;
  const receipts = {};
  let revision = 0;
  return {
    save(input, mutationId, expected) {
      const decision = sessionSyncDecision(row, receipts, mutationId, expected, input);
      if (decision.replay) return structuredClone(row);
      row = { ...input, updatedAt: `2026-01-01T00:00:00.${String(++revision).padStart(3, "0")}Z` };
      receipts[mutationId] = { fingerprint: decision.fingerprint };
      return structuredClone(row);
    },
    externalEdit() { row = { ...row, notes: "Coach/server edit", updatedAt: "2026-01-01T00:01:00.000Z" }; },
    delete() { row = undefined; },
  };
}
const input = () => ({ id: randomUUID(), assignmentId: randomUUID(), workoutId: randomUUID(), notes: "local fixture", sets: [] });

test("stable ID create replay does not duplicate or change server revision", () => {
  const backend = fixture(), data = input(), mutation = randomUUID();
  const created = backend.save(data, mutation, "new");
  assert.deepEqual(backend.save(data, mutation, "new"), created);
  assert.equal(created.id, data.id);
});
test("lost update response retry is idempotent", () => {
  const backend = fixture(), data = input();
  const created = backend.save(data, randomUUID(), "new");
  const edit = { ...data, notes: "completed" }, mutation = randomUUID();
  const updated = backend.save(edit, mutation, created.updatedAt);
  assert.deepEqual(backend.save(edit, mutation, created.updatedAt), updated);
});
test("replay of an older command cannot overwrite a newer revision", () => {
  const backend = fixture(), data = input(), first = randomUUID();
  const created = backend.save(data, first, "new");
  const updated = backend.save({ ...data, notes: "newer" }, randomUUID(), created.updatedAt);
  assert.deepEqual(backend.save(data, first, "new"), updated);
});
test("concurrent server edits explicitly conflict and remain unmodified", () => {
  const backend = fixture(), data = input();
  const created = backend.save(data, randomUUID(), "new");
  backend.externalEdit();
  assert.throws(() => backend.save({ ...data, notes: "offline edit" }, randomUUID(), created.updatedAt), { status: 409 });
});
test("same mutation ID with different payload is rejected", () => {
  const backend = fixture(), data = input(), mutation = randomUUID();
  backend.save(data, mutation, "new");
  assert.throws(() => backend.save({ ...data, notes: "different" }, mutation, "new"), { status: 409 });
});
test("new create cannot overwrite an existing stable ID", () => {
  const backend = fixture(), data = input();
  backend.save(data, randomUUID(), "new");
  assert.throws(() => backend.save(data, randomUUID(), "new"), { status: 409 });
});
test("editing a deleted server row conflicts, never recreates it", () => {
  const backend = fixture(), data = input();
  const created = backend.save(data, randomUUID(), "new");
  backend.delete();
  assert.throws(() => backend.save(data, randomUUID(), created.updatedAt), { status: 409 });
});
test("fixture revision chain can complete draft then completed session", () => {
  const backend = fixture(), data = input();
  const draft = backend.save({ ...data, status: "draft" }, randomUUID(), "new");
  const completed = backend.save({ ...data, status: "completed" }, randomUUID(), draft.updatedAt);
  assert.equal(completed.status, "completed");
  assert.notEqual(completed.updatedAt, draft.updatedAt);
});
