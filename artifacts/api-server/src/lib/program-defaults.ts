import type { Program } from "./training-types";

export function normalizeRange(value: string): string {
  const text=value.trim();
  // Excel date coercion: month and day are the intended prescription range.
  const iso=text.match(/^\d{4}-(\d{1,2})-(\d{1,2})(?:T.*)?\??$/);
  const date=text.match(/^(\d{1,2})[-/](\d{1,2})[-/]\d{4}\??$/);
  const range=text.match(/^(\d+)\s*[-–—]\s*(\d+)\??$/);
  const match=iso || date || range;
  return match ? `${Number(match[1])}-${Number(match[2])}` : value;
}

/** Apply source conventions to every template and assignment, including records
 * saved before these fields existed. Never changes completed workout logs. */
export function normalizeProgram(program: Program): Program {
  const workouts = program.workouts.map(workout => ({
    ...workout,
    exercises: workout.exercises.map(ex => {
      const reps=normalizeRange(ex.reps);
      const sets=normalizeRange(ex.sets);
      const notes=ex.notes
        .replace(/Import review: (?:sets|reps) source Excel date serial [^\n]*?(?:Confirm against original\.)/g,"")
        .replace(`Source weight (lbs): ${ex.weight}.`, "")
        .replace(`Source weight (unit not specified): ${ex.weight}.`, "").trim();
      const acceptedRange=/^\d+-\d+$/.test(reps) || /^\d+-\d+$/.test(sets);
      return {...ex,reps,sets,notes,
        review: acceptedRange && !notes.includes("Import review:") ? false : ex.review,
        sourceUnit:"lb" as const,weight:"",setWeights:[]};
    }),
  }));
  return {
    ...program,
    description:program.description
      .replace(/Imported from your workbook\.\s*/gi,"")
      .replace(/Prescriptions and source references only, not completed workout history\.\s*/gi,"")
      .replace(/Review flagged Excel date conversions before assigning\.\s*/gi,"").trim(),
    workouts,
    reviewCount:workouts.reduce((sum,w)=>sum+w.exercises.filter(e=>e.review).length,0),
  };
}
