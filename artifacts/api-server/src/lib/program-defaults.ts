import type { Program } from "./training-types";

/** Apply source conventions to every template and assignment, including records
 * saved before these fields existed. Never changes completed workout logs. */
export function normalizeProgram(program: Program): Program {
  return {
    ...program,
    workouts: program.workouts.map(workout => ({
      ...workout,
      exercises: workout.exercises.map(ex => ({
        ...ex,
        sourceUnit: "lb",
        weight: "",
        setWeights: [],
        notes: ex.notes
          .replace(`Source weight (lbs): ${ex.weight}.`, "")
          .replace(`Source weight (unit not specified): ${ex.weight}.`, "").trim(),
      })),
    })),
  };
}
