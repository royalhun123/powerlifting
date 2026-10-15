import type { Session } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WorkoutDiscussion } from "@/components/workout-discussion";
import { fmtDate, fmtNum } from "@/lib/pl";

export function SessionSummary({session,onClose}:{session:Session|null;onClose:()=>void}) {
  return <Dialog open={!!session} onOpenChange={open=>!open && onClose()}>
    <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto" data-testid="completed-workout-summary">
      <DialogHeader>
        <DialogTitle>{session?.name}</DialogTitle>
        <DialogDescription>{session && `${fmtDate(session.date)} · ${session.status} · ${fmtNum(session.volume)} ${session.unit} total volume`} · Logged numbers are read-only here. Use Edit in History to change them.</DialogDescription>
      </DialogHeader>
      {session && <>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b"><th className="p-2">Exercise</th><th className="p-2">Set</th><th className="p-2">Weight ({session.unit})</th><th className="p-2">Reps</th><th className="p-2">RPE</th><th className="p-2">Notes</th></tr></thead>
          <tbody>{session.sets.map((set,i)=><tr key={`${set.exerciseId}-${set.setNumber}-${i}`} className="border-b">
            <td className="p-2">{set.exerciseName}{!set.completed && <span className="block text-xs text-muted-foreground">Not completed</span>}</td>
            <td className="p-2">{set.setNumber}</td><td className="p-2">{fmtNum(set.weight)}</td><td className="p-2">{set.reps}</td><td className="p-2">{set.rpe || "—"}</td><td className="p-2 whitespace-pre-wrap">{set.notes || "—"}</td>
          </tr>)}</tbody>
        </table></div>
        {session.notes && <div><h3 className="font-medium">Session notes</h3><p className="whitespace-pre-wrap text-sm">{session.notes}</p></div>}
        <WorkoutDiscussion session={session} />
      </>}
      <Button variant="outline" onClick={onClose}>Back to workouts</Button>
    </DialogContent>
  </Dialog>;
}
