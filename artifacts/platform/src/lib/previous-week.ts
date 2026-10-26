import type { Assignment, Exercise, Session, Workout } from "@workspace/api-client-react";

const key = (exercise: Exercise) => `${exercise.lift}:${exercise.name.trim().toLowerCase().replace(/\s+/g, " ")}`;

/** Match the immediately preceding program week, not the previous calendar week. */
export function previousWeekResult(assignment: Assignment, workout: Workout, exercise: Exercise, sessions: Session[]) {
  const previous = assignment.program.workouts.find(w => w.week === workout.week - 1 && w.day === workout.day);
  if (!previous) return null;
  // Copied weeks have new exercise IDs. Match name/type and occurrence so repeated
  // exercises (e.g. top sets followed by back-offs) do not share the wrong results.
  const occurrence = workout.exercises.filter(e => key(e) === key(exercise)).findIndex(e => e.id === exercise.id);
  const match = previous.exercises.filter(e => key(e) === key(exercise))[occurrence];
  if (!match) return null;
  const session = sessions.filter(s =>
    s.athleteId === assignment.athleteId && s.assignmentId === assignment.id &&
    s.workoutId === previous.id && s.status === "completed"
  ).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!session) return null;
  const sets = session.sets.filter(s => s.exerciseId === match.id && s.reps > 0 && (s.weight > 0 || s.lift === "accessory"))
    .sort((a, b) => a.setNumber - b.setNumber);
  return sets.length ? { session, sets } : null;
}
