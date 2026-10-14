import test from "node:test";
import assert from "node:assert/strict";
import { maxTrendCeiling } from "../src/lib/max-trend.ts";

test("max trend scales from zero to highest graphed lift plus fifty",()=>{
  assert.equal(maxTrendCeiling([{squat:400,bench:250,deadlift:500}]),550);
  assert.equal(maxTrendCeiling([{squat:null,bench:225,deadlift:null}]),275);
  assert.equal(maxTrendCeiling([{squat:400},{deadlift:515.5}]),565.5);
  assert.equal(maxTrendCeiling([{squat:null,bench:null,deadlift:null}]),50);
  assert.equal(maxTrendCeiling([]),50);
});
