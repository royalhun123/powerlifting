import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRange, normalizeProgram } from "../src/lib/program-defaults.ts";

test("accept ranges and date-coerced ranges without question marks",()=>{
  for(const [input,expected] of [
    ["8-10","8-10"],["8-10?","8-10"],["8 – 10","8-10"],
    ["8-10-2026","8-10"],["08/10/2026","8-10"],["2026-08-10","8-10"],
    ["2026-08-10T00:00:00","8-10"],["AMRAP","AMRAP"],["5","5"]
  ]) assert.equal(normalizeRange(input),expected);
});

test("normalize old snapshots without mutating source or unrelated coach edits",()=>{
  const program={id:"test",name:"Coach custom block",description:"Keep my edits",reviewCount:2,
    workouts:[{id:"workout",name:"Custom day",exercises:[
      {id:"a",name:"Cable row",sets:"3",reps:"8-10?",weight:"",effort:"RPE 8",notes:"Coach note stays.\nImport review: reps source Excel date serial 46244 may mean 8-10. Confirm against original.",review:true},
      {id:"b",name:"Squat",sets:"3",reps:"8-10-2026",weight:"",effort:"75%",notes:"Import review: notes source Excel date serial 46244 may mean 8-10. Confirm against original.",review:true}
    ]}]};
  const original=structuredClone(program);
  const output=normalizeProgram(program);
  assert.deepEqual(program,original);
  assert.equal(output.name,program.name);
  assert.equal(output.description,program.description);
  const [range,ambiguous]=output.workouts[0].exercises;
  assert.equal(range.reps,"8-10");
  assert.equal(range.review,false);
  assert.equal(range.notes,"Coach note stays.");
  assert.equal(range.effort,"RPE 8");
  assert.equal(ambiguous.reps,"8-10");
  assert.equal(ambiguous.review,true);
  assert.equal(ambiguous.effort,"75%");
  assert.equal(output.reviewCount,1);
  assert.deepEqual(normalizeProgram(output),output);
  const description="Imported from your workbook. Prescriptions and source references only, not completed workout history. Review flagged Excel date conversions before assigning. Keep my own coaching instructions.";
  assert.equal(normalizeProgram({...program,description}).description,"Keep my own coaching instructions.");
});
