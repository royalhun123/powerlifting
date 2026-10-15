import { useGetLifterTrueMaxes, getGetLifterTrueMaxesQueryKey } from "@workspace/api-client-react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiftTag, Panel } from "@/components/common";
import { ClientBodyweights } from "@/components/client-bodyweights";
import { errMessage } from "@/hooks/use-platform";
import { fmtDate, fmtNum } from "@/lib/pl";

/** Read-only dated list of a lifter's tested one-rep maxes (admin or group leader). */
export function LifterTrueMaxes({ athleteId, athleteName }: { athleteId: string; athleteName: string }) {
  const q = useGetLifterTrueMaxes(athleteId, { query: { queryKey: getGetLifterTrueMaxesQueryKey(athleteId), enabled: !!athleteId, staleTime: 30_000 } });
  const rows = (q.data ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Panel title="Tested maxes" action={<span className="inline-flex items-center gap-1 border px-1.5 py-0.5 font-num text-[10px] uppercase tracking-widest text-muted-foreground"><Eye className="h-3 w-3" /> Read-only</span>}>
      {q.isLoading ? <div className="space-y-2" data-testid={`true-max-loading-${athleteId}`}>{[0, 1].map((i) => <div key={i} className="h-8 animate-pulse bg-muted" />)}</div>
        : q.isError ? <div role="alert" className="text-sm">{errMessage(q.error)} <Button size="sm" variant="outline" className="ml-2" onClick={() => q.refetch()} data-testid={`button-retry-true-max-${athleteId}`}>Retry</Button></div>
        : rows.length === 0 ? <p className="py-3 text-center text-sm text-muted-foreground">{athleteName} has not logged a tested max yet.</p>
        : <ul className="max-h-72 divide-y overflow-auto border-y" data-testid={`list-true-max-${athleteId}`}>{rows.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm" data-testid={`row-true-max-${m.id}`}>
              <span className="font-num text-xs text-muted-foreground">{fmtDate(m.date)}</span>
              <LiftTag lift={m.lift} />
              <span className="font-num font-semibold">{fmtNum(m.weight)} {m.unit}</span>
            </li>))}</ul>}
    </Panel>
  );
}

export function LifterMeasurements({ athleteId, athleteName }: { athleteId: string; athleteName: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ClientBodyweights athleteId={athleteId} athleteName={athleteName} days={0} />
      <LifterTrueMaxes athleteId={athleteId} athleteName={athleteName} />
    </div>
  );
}
