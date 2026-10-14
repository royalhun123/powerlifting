import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetBodyweights, useSaveBodyweight, useDeleteBodyweight } from "@workspace/api-client-react";
import { Line, LineChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingPage, Panel } from "@/components/common";
import { useWorkspace, useMutationGuard, errMessage } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { fmtDate, fmtNum, todayISO } from "@/lib/pl";

export function BodyweightForm() {
  const [open, setOpen] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState<"morning" | "day" | "night">("morning");
  const { data: workspace } = useWorkspace();
  const guard = useMutationGuard();
  const { toast } = useToast();
  const client = useQueryClient();
  const save = useSaveBodyweight();
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState("");
  const [chosenUnit, setUnit] = useState<"lb" | "kg" | "">("");
  const unit = chosenUnit || workspace?.profile.unit || "lb";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" data-testid="button-open-bodyweight">Log bodyweight</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log bodyweight</DialogTitle><DialogDescription>Record a weigh-in for morning, day, or night.</DialogDescription></DialogHeader>
        <form className="flex flex-wrap items-end gap-3" onSubmit={async event => {
          event.preventDefault();
          if (!guard()) return;
          try {
            await save.mutateAsync({data:{date,weight:Number(weight),unit,timeOfDay}});
            await client.invalidateQueries({queryKey:["/api/bodyweights"]});
            setWeight("");
            setOpen(false);
            toast({title:"Bodyweight saved",description:`${fmtDate(date)} · ${weight} ${unit}`});
          } catch (error) {
            toast({title:"Could not save bodyweight",description:errMessage(error),variant:"destructive"});
          }
        }}>
          <label className="grid min-w-36 flex-1 gap-1 text-xs font-medium">Date
            <Input type="date" required value={date} onChange={e=>setDate(e.target.value)} data-testid="input-bodyweight-date" />
          </label>
          <div className="grid min-w-32 flex-1 gap-1 text-xs font-medium"><span>Time of day</span>
            <Select value={timeOfDay} onValueChange={v=>setTimeOfDay(v as "morning"|"day"|"night")}>
              <SelectTrigger aria-label="Time of day" data-testid="select-bodyweight-time"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="morning">Morning</SelectItem><SelectItem value="day">Day</SelectItem><SelectItem value="night">Night</SelectItem></SelectContent>
            </Select>
          </div>
          <label className="grid min-w-28 flex-1 gap-1 text-xs font-medium">Bodyweight
            <Input type="number" inputMode="decimal" min="0.01" max="2000" step="any" required placeholder="Enter weight" value={weight} onChange={e=>setWeight(e.target.value)} data-testid="input-bodyweight" />
          </label>
          <div className="grid w-24 gap-1 text-xs font-medium"><span>Unit</span>
            <Select value={unit} onValueChange={v=>setUnit(v as "lb"|"kg")}>
              <SelectTrigger aria-label="Bodyweight unit" data-testid="select-bodyweight-unit"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="lb">lbs</SelectItem><SelectItem value="kg">kg</SelectItem></SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={save.isPending} data-testid="button-log-bodyweight">{save.isPending ? "Saving…" : "Log bodyweight"}</Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">One entry per time of day. Logging the same date and time again updates that entry. Other weigh-ins are kept separately.</p>
      </DialogContent>
    </Dialog>
  );
}

export function BodyweightProgress({ days }: { days: number }) {
  const query = useGetBodyweights({query:{queryKey:["/api/bodyweights"],staleTime:20_000,refetchInterval:60_000}});
  const {data:workspace} = useWorkspace();
  const unit = workspace?.profile.unit ?? "lb";
  const remove = useDeleteBodyweight();
  const client = useQueryClient();
  const {toast} = useToast();
  const guard = useMutationGuard();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate()-days);
  const cutoffDate = cutoff.toISOString().slice(0,10);
  const entries = (query.data ?? []).filter(entry=>entry.date>=cutoffDate).map(entry=>({
    ...entry,
    timeOfDay: entry.timeOfDay ?? "unspecified" as const,
    label: `${fmtDate(entry.date)} · ${entry.timeOfDay && entry.timeOfDay !== "unspecified" ? entry.timeOfDay : "time not recorded"}`,
    displayedWeight: Math.round((entry.unit===unit ? entry.weight : unit==="kg" ? entry.weight/2.2046226218 : entry.weight*2.2046226218)*100)/100,
  }));
  return (
    <div className="mt-6">
      <Panel title={`Bodyweight trend (${unit === "lb" ? "lbs" : "kg"})`}>
        {query.isLoading ? <LoadingPage /> : query.isError ? <ErrorState message={errMessage(query.error)} onRetry={()=>query.refetch()} /> : !entries.length ? (
          <EmptyState title="No bodyweight entries in this period" body="Use Log bodyweight on the dashboard to record your first weigh-in." />
        ) : (
          <>
            <div className="h-64 w-full" role="img" aria-label={`Bodyweight over time in ${unit}. Exact values are listed below.`} data-testid="chart-bodyweight">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={entries} margin={{top:12,right:20,bottom:8,left:4}}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" minTickGap={32} tick={{fontSize:11}} />
                  <YAxis domain={["auto","auto"]} tick={{fontSize:11}} width={55} />
                  <Tooltip formatter={v=>[`${fmtNum(Number(v),2)} ${unit}`,"Bodyweight"]} />
                  <Line type="linear" dataKey="displayedWeight" stroke="#182852" strokeWidth={2} dot={{r:4}} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium">View / remove entries ({entries.length})</summary>
              <div className="mt-2 max-h-72 overflow-auto">
                {entries.slice().reverse().map(entry=>(
                  <div key={`${entry.date}-${entry.timeOfDay}`} className="flex items-center justify-between gap-3 border-t py-2 text-sm">
                    <span className="capitalize">{entry.label} · {fmtNum(entry.displayedWeight,2)} {unit}</span>
                    <Button variant="ghost" size="sm" disabled={remove.isPending} aria-label={`Delete bodyweight for ${entry.date}`} onClick={async()=>{
                      if (!guard() || !window.confirm(`Delete the bodyweight entry for ${entry.label}?`)) return;
                      try {
                        await remove.mutateAsync({date:entry.date,timeOfDay:entry.timeOfDay});
                        await client.invalidateQueries({queryKey:["/api/bodyweights"]});
                      } catch(error) { toast({title:"Could not delete entry",description:errMessage(error),variant:"destructive"}); }
                    }}>Delete</Button>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </Panel>
    </div>
  );
}
