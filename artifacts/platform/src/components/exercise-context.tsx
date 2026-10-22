import type { Exercise, Workout } from "@workspace/api-client-react";

export const MUSCLE_GROUPS = ["chest", "lats", "upper back", "shoulders", "rear delts", "biceps", "triceps", "quads", "abductors", "adductors", "hamstrings", "calves", "abs", "custom"] as const;

export function ExerciseContext({ exercise, workout }: { exercise: Exercise; workout: Workout }) {
  const circuit = workout.circuits?.find(c => c.id === exercise.circuitId);
  const group = exercise.lift === "accessory" && (exercise.muscleGroup === "custom" ? exercise.customMuscleGroup || "Custom" : exercise.muscleGroup);
  if (!circuit && !group) return null;
  return <p className="my-2 text-xs font-medium text-primary">
    {circuit && `${circuit.name} · ${circuit.rounds} rounds · ${circuit.restSeconds}s rest between rounds`}
    {circuit && group && " · "}{group}
  </p>;
}
