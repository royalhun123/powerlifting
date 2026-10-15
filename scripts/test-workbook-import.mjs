import assert from "node:assert/strict";
import { parseWorkbookSheets, prescription } from "../artifacts/platform/src/lib/workbook-parser.ts";

assert.equal(prescription("8-10-2026"),"8-10");
assert.equal(prescription(new Date("2026-08-10T00:00:00Z")),"8-10");
assert.equal(prescription("2026-08-10"),"8-10");
const result=parseWorkbookSheets([{sheet:"Peak",data:[
  ["Week","Day","Workout","Exercise","Sets","Reps","Effort","Weight","Notes"],
  [1,"Monday","A","Comp squat",3,"8-10-2026",0.85,315,"test"],
  [1,1,"A","Bench",3,5,"RPE 8",200,""],
]}]);
const p=result.programs[0], ex=p.workouts[0].exercises[0];
assert.equal(p.workouts.length,1);
assert.equal(ex.reps,"8-10");
assert.equal(ex.effort,"85%");
assert.equal(ex.weight,"");
assert.deepEqual(ex.setWeights,[]);
assert.equal(ex.review,false);
const blocks=parseWorkbookSheets([{sheet:"Deload",data:[
  ["Week 1",null,null,null,null,null,null,"Week 2"],
  ["Monday",null,null,null,null,null,null,"Wednesday"],
  ["Exercise","Sets","Reps","Effort","Weight","Notes",null,"Exercise","Sets","Reps","Effort"],
  ["Comp squat",3,3,"RPE 6",300,"",null,"Bench",3,5,0.8],
]}]);
assert.equal(blocks.programs[0].weeks,2);
assert.equal(blocks.programs[0].workouts[1].day,3);
assert.equal(blocks.programs[0].workouts[1].exercises[0].effort,"80%");
assert.throws(()=>parseWorkbookSheets([{sheet:"invalid",data:[["nothing"]]}]),/no supported/i);
console.log("PASS: table/block imports, dates as ranges, percentages, unsupported sheet errors, historical weights excluded.");
