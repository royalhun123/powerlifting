import test from "node:test";
import assert from "node:assert/strict";
import { parseWorkbookSheets, parseSheet, parseSheetWithMapping, splitCombo, parseLabel, draftToProgram, validateProgram, prescription } from "../src/lib/workbook-parser.ts";

const all = (d) => d.workouts.flatMap((w) => w.exercises);

test("original horizontal Exercise/Sets/Reps week blocks", () => {
  const data = [
    ["Week 1", null, null, null, "Week 2", null, null, null],
    ["Monday", null, null, null, "Monday", null, null, null],
    ["Exercise", "Sets", "Reps", "RPE", "Exercise", "Sets", "Reps", "RPE"],
    ["Squat", 4, 5, 7, "Squat", 4, 4, 8],
    ["Bench", 3, 8, 7, "Bench", 3, 6, 8],
    ["Thursday", null, null, null, "Thursday", null, null, null],
    ["Exercise", "Sets", "Reps", "RPE", "Exercise", "Sets", "Reps", "RPE"],
    ["Deadlift", 3, 3, 8, "Deadlift", 2, 3, 9],
  ];
  const d = parseSheet("Block 1", data);
  assert.equal(d.workouts.length, 4);
  const w2thu = d.workouts.find((w) => w.week === 2 && w.day === 4);
  assert.equal(w2thu.exercises[0].name, "Deadlift");
  assert.equal(w2thu.exercises[0].effort, "RPE 9");
  assert.equal(d.workouts[0].exercises[0].lift, "squat");
  assert.equal(d.workouts.every((w) => w.flags.length === 0), true);
});

test("strict table with aliases, variable order, weekday days, percent fraction", () => {
  const data = [
    ["Wk", "Movement", "% 1RM", "Reps", "Sets", "Session", "Comments"],
    [1, "Comp Squat", 0.75, 5, 4, "Monday", "belt"],
    [1, "Bench Press", 0.7, 8, 3, "Wednesday", ""],
    [2, "Comp Squat", 0.8, 3, 5, "Monday", ""],
  ];
  const d = parseSheet("Volume", data);
  assert.equal(d.layout, "table");
  assert.equal(d.workouts.length, 3);
  const ex = d.workouts[0].exercises[0];
  assert.deepEqual([ex.sets, ex.reps, ex.effort, ex.notes], ["4", "5", "75%", "belt"]);
  assert.equal(d.workouts[1].day, 3);
  assert.equal(d.weeks, 2);
});

test("combined sets x reps column with trailing RPE and RIR column", () => {
  const data = [
    ["Exercise", "Sets x Reps", "RIR"],
    ["Squat", "5x3 @ 80%", 2],
    ["RDL", "3 x 8-10", ""],
  ];
  const d = parseSheet("S", data);
  const [a, b] = all(d);
  assert.deepEqual([a.sets, a.reps, a.effort], ["5", "3", "RIR 2 @ 80%"]);
  assert.deepEqual([b.sets, b.reps], ["3", "8-10"]);
});

test("vertically stacked weeks and workouts with headings", () => {
  const data = [
    ["Hypertrophy Phase"],
    ["Week 1"],
    ["Day 1 - Lower"],
    ["Exercise", "Sets", "Reps", "Load"],
    ["Squat", 4, 6, 315],
    ["Day 2 - Upper"],
    ["Bench", 4, 8, 225],
    ["Week 2"],
    ["Day 1 - Lower"],
    ["Squat", 5, 5, 325],
  ];
  const d = parseSheet("Stacked", data);
  assert.equal(d.workouts.length, 3);
  assert.deepEqual(d.workouts.map((w) => [w.week, w.day]), [[1, 1], [1, 2], [2, 1]]);
  assert.equal(d.workouts[1].name, "Day 2 - Upper");
  // Recorded/load weights never imported and reported.
  assert.equal(all(d).every((e) => e.weight === ""), true);
  assert.ok(d.warnings.some((w) => /Load/.test(w)));
  // The title row is listed, not silently dropped.
  assert.ok(d.skipped.some((s) => s.text === "Hypertrophy Phase"));
});

test("date-formatted rep ranges accepted", () => {
  assert.equal(prescription(new Date(Date.UTC(2024, 2, 5))), "3-5");
  const d = parseSheet("D", [["Exercise", "Sets", "Reps"], ["Row", 3, new Date(Date.UTC(2024, 7, 10))]]);
  assert.equal(all(d)[0].reps, "8-10");
  assert.equal(all(d)[0].review, false);
});

test("session letters and missing week produce explicit guess flags", () => {
  const d = parseSheet("Letters", [["Session A"], ["Exercise", "Sets", "Reps"], ["Squat", 3, 5], ["Session B"], ["Exercise", "Sets", "Reps"], ["Bench", 3, 5]]);
  assert.deepEqual(d.workouts.map((w) => w.day), [1, 2]);
  assert.ok(d.workouts[0].flags.some((f) => /letter/.test(f)));
  assert.ok(d.workouts[0].flags.some((f) => /week 1/i.test(f)));
});

test("freeform layout guesses with warnings and lists unknown lines", () => {
  const data = [["Week 3"], ["Monday"], ["Squat 5x5 @ RPE 7"], ["Bench", "4x8", "70%"], ["Eat well and sleep", "seriously"]];
  const d = parseSheet("Free", data);
  assert.equal(d.layout, "freeform");
  assert.equal(d.workouts[0].week, 3);
  assert.equal(d.workouts[0].day, 1);
  const [a, b] = all(d);
  assert.deepEqual([a.name, a.sets, a.reps, a.effort], ["Squat", "5", "5", "RPE 7"]);
  assert.deepEqual([b.name, b.effort], ["Bench", "70%"]);
  assert.ok(a.review && a.flags.length);
  assert.ok(d.skipped.some((s) => /Eat well/.test(s.text)));
});

test("unknown layout yields empty draft for mapping, then mapping imports", () => {
  const data = [["Lift name", "Volume plan", "Hint"], ["Squat", "3 by 5", "x"], ["Press", "3 by 8", ""]];
  const d = parseSheet("Odd", data);
  assert.equal(d.layout, "none");
  assert.equal(d.workouts.length, 0);
  assert.ok(d.skipped.length >= 3);
  const m = parseSheetWithMapping("Odd", data, { headerRow: 0, columns: { exercise: 0, reps: 1, notes: 2 } });
  assert.equal(all(m).length, 2);
  assert.equal(all(m)[0].reps, "3 by 5");
  assert.ok(all(m)[0].review);
});

test("ambiguous numeric intensity flagged; rest/total lines reported", () => {
  const d = parseSheet("Amb", [["Exercise", "Sets", "Reps", "Intensity"], ["Squat", 3, 5, 8], ["Bench", 3, 5, 75], ["Total", 6, 10, ""], ["Rest day"]]);
  const [a, b] = all(d);
  assert.equal(a.effort, "RPE 8");
  assert.ok(a.flags.some((f) => /RPE/.test(f)));
  assert.equal(b.effort, "75%");
  assert.ok(d.skipped.some((s) => /Rest day/.test(s.text)));
});

test("blank week/day cells forward-filled with a warning", () => {
  const d = parseSheet("Fill", [["Week", "Day", "Exercise", "Sets", "Reps"], [1, 1, "Squat", 3, 5], ["", "", "Bench", 3, 5], ["", 2, "Deadlift", 1, 3]]);
  assert.equal(d.workouts.length, 2);
  assert.equal(d.workouts[0].exercises.length, 2);
  assert.ok(d.warnings.some((w) => /filled/.test(w)));
});

test("helpers: combos and labels", () => {
  assert.deepEqual(splitCombo("4 sets of 6-8"), { sets: "4", reps: "6-8", rest: "" });
  assert.deepEqual(splitCombo("3x AMRAP"), { sets: "3", reps: "AMRAP", rest: "" });
  assert.deepEqual(parseLabel("W2D3"), { week: 2, day: 3, name: "W2D3" });
  assert.equal(parseLabel("Week 4 - Friday").day, 5);
  assert.equal(parseLabel("Squat"), null);
});

test("validation blocks bad edits; workbook returns drafts and programs", () => {
  const r = parseWorkbookSheets([{ sheet: "A", data: [["Exercise", "Sets", "Reps"], ["Squat", 3, 5]] }, { sheet: "Blank", data: [[null]] }]);
  assert.equal(r.drafts.length, 1);
  assert.equal(r.programs.length, 1);
  assert.deepEqual(validateProgram(r.programs[0]), []);
  const d = r.drafts[0];
  d.workouts[0].week = 3;
  d.workouts[0].exercises[0].name = "";
  const errs = validateProgram(draftToProgram(d));
  assert.ok(errs.some((e) => /beyond/.test(e)));
  assert.ok(errs.some((e) => /missing its name/.test(e)));
  assert.equal("flags" in draftToProgram(d).workouts[0].exercises[0], false);
});
