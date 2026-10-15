import { useState } from "react";
import { useRemoveAssignment, type Assignment } from "@workspace/api-client-react";
import { useWorkspace, useMutationGuard, useInvalidateAll, errMessage } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { Panel } from "@/components/common";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { fmtDate } from "@/lib/pl";

export function AssignmentOverview({programId}:{programId?:string}) {
  const {data}=useWorkspace();
  const remove=useRemoveAssignment();
  const invalidate=useInvalidateAll();
  const guard=useMutationGuard();
  const {toast}=useToast();
  const [selected,setSelected]=useState<Assignment|null>(null);
  if(!data?.isGroupLeader) return null;
  const assignments=data.assignments.filter(a=>a.athleteId!==data.profile.id && (!programId || a.program.id===programId))
    .sort((a,b)=>a.athleteName.localeCompare(b.athleteName)||b.startDate.localeCompare(a.startDate));
  const active=assignments.filter(a=>!a.archived).length;
  return <div className="mb-5">
    <Panel title="Lifter program assignments">
      <p className="mb-4 text-sm text-muted-foreground" data-testid="assignment-counts">
        {assignments.length} assignments · {active} active · {assignments.length-active} archived · {new Set(assignments.map(a=>a.athleteId)).size} lifters
      </p>
      {!assignments.length ? <p className="text-sm text-muted-foreground">No programs assigned to lifters{programId ? " from this template" : ""}.</p> :
        <ul className="divide-y">{assignments.map(a=><li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><div className="font-medium">{a.program.name} — {a.athleteName}</div>
            <p className="text-xs text-muted-foreground">Starts {fmtDate(a.startDate)} · {a.archived ? "Archived by athlete" : "Active"}</p></div>
          {a.archived ? <Button size="sm" variant="outline" className="text-destructive" disabled={remove.isPending} onClick={()=>guard() && setSelected(a)} data-testid={`remove-assignment-${a.id}`}>Delete</Button> : <span className="font-num text-[10px] uppercase tracking-widest text-muted-foreground">Archive to delete</span>}
        </li>)}</ul>}
    </Panel>
    <AlertDialog open={!!selected} onOpenChange={open=>!open && setSelected(null)}>
      <AlertDialogContent><AlertDialogHeader>
        <AlertDialogTitle>Delete this archived block?</AlertDialogTitle>
        <AlertDialogDescription>Remove {selected?.program.name} from {selected?.athleteName}? It is permanently removed from their archived list. Completed workout logs, progress, and the original program template are preserved. To give it back later, assign the template again.</AlertDialogDescription>
      </AlertDialogHeader><AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction disabled={remove.isPending} onClick={e=>{
          e.preventDefault();
          if(!selected || !selected.archived || !guard()) return;
          remove.mutate({id:selected.id},{onSuccess:async()=>{await invalidate();setSelected(null);toast({title:"Block deleted; workout logs kept"});},
            onError:error=>toast({title:"Could not remove program",description:errMessage(error),variant:"destructive"})});
        }}>{remove.isPending ? "Deleting…" : "Delete"}</AlertDialogAction>
      </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div>;
}
