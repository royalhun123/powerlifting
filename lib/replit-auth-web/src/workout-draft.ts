import type { SessionInput } from "@workspace/api-client-react";
import type { WorkoutRecovery } from "./offline";

/** Automatic edits must never undo an athlete's explicit completion. */
export function recoverySessionInput(state: WorkoutRecovery): SessionInput {
  return {
    id: state.id,
    assignmentId: state.assignment.id,
    workoutId: state.workout.id,
    name: state.workout.name,
    date: state.date,
    unit: state.unit,
    notes: state.notes,
    status: state.originalStatus === "completed" ? "completed" : "draft",
    sets: state.sets.map((set, i) => ({
      ...set,
      setNumber: state.sets.slice(0, i).filter(prior => prior.exerciseId === set.exerciseId).length + 1,
    })),
  };
}
