import { Link } from "wouter";
import { useWorkspace, errMessage } from "@/hooks/use-platform";
import { EmptyState, ErrorState, LoadingPage, PageHeader, Panel } from "@/components/common";
import { fmtDate, PHASE_LABEL } from "@/lib/pl";

/** Read-only assignment snapshots, never the coach's draft library. */
export default function MyPrograms() {
  const {data,isLoading,isError,error,refetch}=useWorkspace();
  if(isLoading) return <LoadingPage />;
  if(isError || !data) return <ErrorState message={errMessage(error)} onRetry={()=>refetch()} />;
  const assignments=data.assignments.filter(a=>a.athleteId===data.profile.id)
    .sort((a,b)=>b.startDate.localeCompare(a.startDate));
  return <div>
    <PageHeader kicker="Your assigned training" title="My programs" />
    <p className="mb-5 text-sm text-muted-foreground">Only programs assigned to you appear here.{data.isCoach ? " Creating a program in All programs does not add it to your own training—assign it to yourself when ready." : " Your coach manages the program; log your own weights, reps, and notes in Workouts."}</p>
    {!assignments.length ? <EmptyState title="No programs assigned yet" body={data.isCoach ? "Choose a program in All programs and assign it to yourself." : "Your coach will assign your training after you accept their invitation."} action={data.isCoach ? <Link href="/programs" className="text-primary underline">Open All programs</Link> : undefined} /> :
      <div className="space-y-5">{assignments.map(assignment=>{
        const workouts=assignment.program.workouts.slice().sort((a,b)=>a.week-b.week||a.day-b.day);
        const completed=new Set(data.sessions.filter(s=>s.athleteId===data.profile.id && s.assignmentId===assignment.id && s.status==="completed").map(s=>s.workoutId));
        return <Panel key={assignment.id} title={assignment.program.name}>
          <div className="mb-3 text-sm text-muted-foreground">{PHASE_LABEL[assignment.program.phase]} · Starts {fmtDate(assignment.startDate)} · {completed.size}/{workouts.length} workouts completed</div>
          <p className="mb-4 text-sm">{assignment.program.description}</p>
          <div className="space-y-2">{workouts.map(workout=><details key={workout.id} className="border p-3">
            <summary className="cursor-pointer font-medium">Week {workout.week} · Day {workout.day} — {workout.name}{completed.has(workout.id) ? " · Completed" : ""}</summary>
            <ul className="my-3 divide-y text-sm">{workout.exercises.map(ex=><li key={ex.id} className="py-2">
              <strong>{ex.name}</strong><div className="text-muted-foreground">Sets: {ex.sets} · Reps: {ex.reps} · Effort: {ex.effort || "—"}</div>
              {ex.notes && <p className="mt-1 text-xs text-muted-foreground">{ex.notes}</p>}
            </li>)}</ul>
            <Link href={`/workouts?assignment=${encodeURIComponent(assignment.id)}&workout=${encodeURIComponent(workout.id)}`} className="text-sm font-medium text-primary underline">Log this workout</Link>
          </details>)}</div>
          <Link href={`/workouts?assignment=${encodeURIComponent(assignment.id)}`} className="mt-4 inline-block text-sm text-primary underline">View workout log</Link>
        </Panel>;
      })}</div>}
  </div>;
}
