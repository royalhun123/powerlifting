import test from "node:test";
import assert from "node:assert/strict";
import { windowStart } from "../src/lib/date-window.ts";

test("to date includes all history, and months use calendar boundaries",()=>{
  assert.equal(windowStart(0,new Date("2026-10-14T12:00:00Z")),"");
  assert.equal(windowStart(30,new Date("2026-03-31T12:00:00Z")),"2026-02-28");
  assert.equal(windowStart(30,new Date("2024-03-31T12:00:00Z")),"2024-02-29");
  assert.equal(windowStart(90,new Date("2026-07-31T12:00:00Z")),"2026-04-30");
  assert.equal(windowStart(180,new Date("2026-01-31T12:00:00Z")),"2025-07-31");
});
