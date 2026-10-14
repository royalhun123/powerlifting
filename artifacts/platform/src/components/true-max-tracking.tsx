import { useState } from "react";
import { windowStart } from "@/lib/date-window";
import { useQueryClient } from "@tanstack/react-query";
import { useGetTrueMaxes, useSaveTrueMax, useDeleteTrueMax, type TrueMax } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingPage, Panel } from "@/components/common";
import { useWorkspace, useMutationGuard, useInvalidateAll, errMessage } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { fmtDate, fmtNum, todayISO, LIFT_LABEL } from "@/lib/pl";

export function TrueMaxButton({ entry }: { entry?: TrueMax }) {
  const [open,setOpen]=useState(false);
  const {data:workspace}=useWorkspace();
  const [date,setDate]=useState(todayISO());
  const [lift,setLift]=useState<"squat"|"bench"|"deadlift">("squat");
  const [weight,setWeight]=useState("");
  const [unit,setUnit]=useState<"lb"|"kg">("lb");
  const save=useSaveTrueMax();
  const guard=useMutationGuard();
  const invalidate=useInvalidateAll();
  const client=useQueryClient();
  const {toast}=useToast();
  return (
    <Dialog open={open} onOpenChange={next=>{
      if(next) {
        setDate(entry?.date ?? todayISO());setLift(entry?.lift ?? "squat");
        setWeight(entry ? String(entry.weight) : "");setUnit(entry?.unit ?? workspace?.profile.unit ?? "lb");
      }
      setOpen(next);
    }}>
      <DialogTrigger asChild><Button variant="outline" size={entry ? "sm" : "default"} data-testid={entry ? `edit-max-${entry.id}` : "button-open-true-max"}>{entry ? "Edit" : "Log true 1RM"}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{entry ? "Edit" : "Log"} true 1RM</DialogTitle><DialogDescription>Only enter a successfully completed, tested one-rep max—not an estimate. No workout or RPE entry is needed.</DialogDescription></DialogHeader>
        <form className="grid grid-cols-2 gap-4" onSubmit={async event=>{
          event.preventDefault();if(!guard()) return;
          try {
            await save.mutateAsync({data:{id:entry?.id,date,lift,weight:Number(weight),unit}});
            await Promise.all([client.invalidateQueries({queryKey:["/api/maxes"]}),invalidate()]);
            setOpen(false);toast({title:"True 1RM saved",description:`${LIFT_LABEL[lift]} · ${weight} ${unit}`});
          } catch(error) {toast({title:"Could not save max",description:errMessage(error),variant:"destructive"});}
        }}>
          <label className="grid gap-1 text-xs font-medium">Date<Input type="date" required value={date} onChange={e=>setDate(e.target.value)} data-testid="input-max-date" /></label>
          <div className="grid gap-1 text-xs font-medium"><span>Lift</span><Select value={lift} onValueChange={v=>setLift(v as typeof lift)}>
            <SelectTrigger aria-label="Max lift" data-testid="select-max-lift"><SelectValue /></SelectTrigger>
            <SelectContent>{(["squat","bench","deadlift"] as const).map(l=><SelectItem key={l} value={l}>{LIFT_LABEL[l]}</SelectItem>)}</SelectContent>
          </Select></div>
          <label className="grid gap-1 text-xs font-medium">Tested max weight<Input type="number" inputMode="decimal" required min="0.01" max="2000" step="any" value={weight} onChange={e=>setWeight(e.target.value)} data-testid="input-max-weight" /></label>
          <div className="grid gap-1 text-xs font-medium"><span>Unit</span><Select value={unit} onValueChange={v=>setUnit(v as typeof unit)}>
            <SelectTrigger aria-label="Max weight unit" data-testid="select-max-unit"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="lb">lbs</SelectItem><SelectItem value="kg">kg</SelectItem></SelectContent>
          </Select></div>
          <p className="col-span-2 text-xs text-muted-foreground">Adds to your 1RM history and trend without changing workout volume or the reference maxes used for programming.</p>
          <Button className="col-span-2" disabled={save.isPending} type="submit" data-testid="button-save-true-max">{save.isPending ? "Saving…" : "Save true 1RM"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TrueMaxHistory({days}:{days:number}) {
  const query=useGetTrueMaxes({query:{queryKey:["/api/maxes"],staleTime:20_000,refetchInterval:60_000}});
  const remove=useDeleteTrueMax();
  const client=useQueryClient();
  const invalidate=useInvalidateAll();
  const guard=useMutationGuard();
  const {toast}=useToast();
  const entries=(query.data ?? []).filter(e=>e.date>=windowStart(days)).slice().reverse();
  return <div className="mt-6"><Panel title="True 1RM history">
    <p className="mb-3 text-sm text-muted-foreground">Tested maxes logged separately from workouts. These actual results also appear in your 1RM trend above.</p>
    {query.isLoading ? <LoadingPage /> : query.isError ? <ErrorState message={errMessage(query.error)} onRetry={()=>query.refetch()} /> : !entries.length ? <EmptyState title="No tested maxes in this period" body="Use Log true 1RM to add current or historical tested maxes." /> : (
      <div className="max-h-96 overflow-auto">
        {entries.map(entry=><div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3" data-testid={`max-entry-${entry.id}`}>
          <div><span className="font-semibold">{LIFT_LABEL[entry.lift]} · {fmtNum(entry.weight,2)} {entry.unit}</span><div className="text-xs text-muted-foreground">{fmtDate(entry.date)}</div></div>
          <div className="flex gap-2"><TrueMaxButton entry={entry} /><Button variant="ghost" size="sm" disabled={remove.isPending} onClick={async()=>{
            if(!guard() || !window.confirm(`Delete ${LIFT_LABEL[entry.lift]} max from ${fmtDate(entry.date)}?`)) return;
            try {
              await remove.mutateAsync({id:entry.id});
              await Promise.all([client.invalidateQueries({queryKey:["/api/maxes"]}),invalidate()]);
            } catch(error) {toast({title:"Could not delete max",description:errMessage(error),variant:"destructive"});}
          }}>Delete</Button></div>
        </div>)}
      </div>
    )}
  </Panel></div>;
}
