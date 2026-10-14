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
        setWeights: ex.setWeights ?? [],
        notes: ex.notes.replaceAll("Source weight (unit not specified):", "Source weight (lbs):"),
      })),
    })),
  };
}
