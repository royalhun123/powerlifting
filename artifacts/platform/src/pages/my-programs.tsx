import { Link } from "wouter";
import { useState } from "react";
import { useArchiveAssignment } from "@workspace/api-client-react";
import { useWorkspace, errMessage, useInvalidateAll, useMutationGuard } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingPage, PageHeader, Panel } from "@/components/common";
import { fmtDate, PHASE_LABEL } from "@/lib/pl";

/** Read-only assignment snapshots, never the coach's draft library. */
export default function MyPrograms() {
  const {data,isLoading,isError,error,refetch}=useWorkspace();
  const [showArchived,setShowArchived]=useState(false);
  const archive=useArchiveAssignment();
  const invalidate=useInvalidateAll();
  const guard=useMutationGuard();
  const {toast}=useToast();
  if(isLoading) return <LoadingPage />;
  if(isError || !data) return <ErrorState message={errMessage(error)} onRetry={()=>refetch()} />;
  const mine=data.assignments.filter(a=>a.athleteId===data.profile.id);
  const assignments=mine.filter(a=>Boolean(a.archived)===showArchived)
    .sort((a,b)=>b.startDate.localeCompare(a.startDate));
  return <div>
    <PageHeader kicker="Your assigned training" title={data.isCoach ? "My training" : "My programs"} />
    <div className="mb-4 flex gap-2">
      <Button variant={!showArchived ? "default" : "outline"} onClick={()=>setShowArchived(false)}>Active ({mine.filter(a=>!a.archived).length})</Button>
      <Button variant={showArchived ? "default" : "outline"} onClick={()=>setShowArchived(true)}>Archived ({mine.filter(a=>a.archived).length})</Button>
    </div>
    <p className="mb-5 text-sm text-muted-foreground">Only programs assigned to you appear here.{data.isCoach ? " Creating or copying a program in the library does not add it to your own training—assign it to yourself when ready." : " Your coach manages the program; log your own weights, reps, and notes in Workouts."}</p>
    {!assignments.length ? <EmptyState title={showArchived ? "No archived programs" : "No active programs"} body={showArchived ? "Programs you archive will appear here. Your workout history is always kept." : data.isCoach ? "Choose a program in the library and assign it to yourself, or restore an archived program." : "Your coach assigns your training. You can also restore an archived program."} action={data.isCoach && !showArchived ? <Link href="/programs" className="text-primary underline">Open program library</Link> : undefined} /> :
      <div className="space-y-5">{assignments.map(assignment=>{
        const workouts=assignment.program.workouts.slice().sort((a,b)=>a.week-b.week||a.day-b.day);
        const completed=new Set(data.sessions.filter(s=>s.athleteId===data.profile.id && s.assignmentId===assignment.id && s.status==="completed").map(s=>s.workoutId));
        return <Panel key={assignment.id} title={assignment.program.name}>
          <p className="mb-3 text-xs text-muted-foreground">Uploaded by {assignment.program.uploaderName || assignment.coachName}</p>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" disabled={archive.isPending} data-testid={`archive-assignment-${assignment.id}`} onClick={()=>{
              if(!guard()) return;
              archive.mutate({id:assignment.id,data:{archived:!assignment.archived}},{
                onSuccess:async()=>{await invalidate();toast({title:assignment.archived ? "Program restored" : "Program archived; workout history kept"});},
                onError:error=>toast({title:"Could not save archive state",description:errMessage(error),variant:"destructive"})});
            }}>{assignment.archived ? "Restore program" : "Archive program"}</Button>
            <span className="text-xs text-muted-foreground">{assignment.archived ? "Archived — restore to resume training." : "Archive old training without deleting any workouts."}</span>
          </div>
          <div className="mb-3 text-sm text-muted-foreground">{PHASE_LABEL[assignment.program.phase]} · Starts {fmtDate(assignment.startDate)} · {completed.size}/{workouts.length} workouts completed</div>
          <p className="mb-4 text-sm">{assignment.program.description}</p>
          <div className="space-y-2">{workouts.map(workout=><details key={workout.id} className="border p-3">
            <summary className="cursor-pointer font-medium">Week {workout.week} · Day {workout.day} — {workout.name}{completed.has(workout.id) ? " · Completed" : ""}</summary>
            <ul className="my-3 divide-y text-sm">{workout.exercises.map(ex=><li key={ex.id} className="py-2">
              <strong>{ex.name}</strong><div className="text-muted-foreground">Sets: {ex.sets} · Reps: {ex.reps} · Effort: {ex.effort || "—"}</div>
              {ex.notes && <p className="mt-1 text-xs text-muted-foreground">{ex.notes}</p>}
            </li>)}</ul>
            {!assignment.archived && <Link href={`/workouts?assignment=${encodeURIComponent(assignment.id)}&workout=${encodeURIComponent(workout.id)}`} className="text-sm font-medium text-primary underline">Log this workout</Link>}
          </details>)}</div>
          <Link href={assignment.archived ? "/workouts" : `/workouts?assignment=${encodeURIComponent(assignment.id)}`} className="mt-4 inline-block text-sm text-primary underline">View workout history</Link>
        </Panel>;
      })}</div>}
  </div>;
}
