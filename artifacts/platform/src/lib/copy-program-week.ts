import type { Workout } from "@workspace/api-client-react";
import { newId } from "./pl";

/** Only populate empty weeks; never overwrite existing programming. */
export function copyPreviousWeek(workouts: Workout[], week: number): Workout[] {
  if (week <= 1 || workouts.some((workout) => workout.week === week)) return workouts;
  const previous = workouts.filter((workout) => workout.week === week - 1);
  if (!previous.length) return workouts;
  const copies = previous.map((workout) => {
    const copy = structuredClone(workout);
    copy.id = newId("wo");
    copy.week = week;
    const circuitIds = new Map((copy.circuits || []).map(c => [c.id, newId("circuit")]));
    copy.circuits = copy.circuits?.map(c => ({ ...c, id: circuitIds.get(c.id)! }));
    // Rename default titles, but retain the lifter's custom workout names.
    if (copy.name === `Week ${week - 1} Day ${copy.day}`) {
      copy.name = `Week ${week} Day ${copy.day}`;
    }
    copy.exercises = copy.exercises.map((exercise) => ({
      ...exercise, id: newId("ex"),
      ...(exercise.circuitId ? { circuitId: circuitIds.get(exercise.circuitId) } : {}),
    }));
    return copy;
  });
  return [...workouts, ...copies];
}
