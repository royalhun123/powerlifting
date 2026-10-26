import type { Assignment, Exercise, Session, Workout } from "@workspace/api-client-react";
import { previousWeekResult } from "@/lib/previous-week";
import { fmtDate, fmtNum } from "@/lib/pl";

export function PreviousWeekReference({ assignment, workout, exercise, sessions }: {
  assignment: Assignment; workout: Workout; exercise: Exercise; sessions: Session[];
}) {
  if (workout.week <= 1) return null;
  const result = previousWeekResult(assignment, workout, exercise, sessions);
  return <div className="w-full rounded border bg-muted/30 p-2 text-xs" data-testid={`previous-week-${exercise.id}`}>
    <p className="font-medium">Previous week · Week {workout.week - 1}, Day {workout.day}</p>
    {result ? <>
      <p className="mt-1 text-muted-foreground">{fmtDate(result.session.date)} · actual logged sets</p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-num">
        {result.sets.map((set, index) => <li key={index}>Set {set.setNumber}: {fmtNum(set.weight)} {result.session.unit === "lb" ? "lbs" : "kg"} × {set.reps} reps</li>)}
      </ul>
    </> : <p className="mt-1 text-muted-foreground">No previous-week data found for this exercise.</p>}
  </div>;
}
