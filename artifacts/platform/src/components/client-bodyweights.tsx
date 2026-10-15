import { useGetClientBodyweights, getGetClientBodyweightsQueryKey, type Bodyweight } from "@workspace/api-client-react";
import { Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/common";
import { errMessage } from "@/hooks/use-platform";
import { windowStart } from "@/lib/date-window";
import { fmtDate, fmtNum } from "@/lib/pl";

const TOD_ORDER: Record<string, number> = { morning: 0, day: 1, night: 2, unspecified: 3 };
const todLabel = (t?: Bodyweight["timeOfDay"]) => (!t || t === "unspecified" ? "Time not recorded" : t === "day" ? "Daytime" : t[0].toUpperCase() + t.slice(1));
const unitLabel = (u: string) => (u === "lb" ? "lbs" : "kg");
const periodLabel = (d: number) => (d === 0 ? "to date" : `last ${d / 30} month${d === 30 ? "" : "s"}`);

export function ClientBodyweights({ athleteId, athleteName, days }: { athleteId: string; athleteName: string; days: number }) {
  const q = useGetClientBodyweights(athleteId, {
    query: { queryKey: getGetClientBodyweightsQueryKey(athleteId), enabled: !!athleteId, staleTime: 30_000, refetchInterval: 60_000 },
  });
  const sorted = (q.data ?? []).slice().sort((a, b) => b.date.localeCompare(a.date) || (TOD_ORDER[b.timeOfDay ?? "unspecified"] - TOD_ORDER[a.timeOfDay ?? "unspecified"]));
  const latest = sorted[0];
  const cutoff = windowStart(days);
  const inWindow = sorted.filter((e) => e.date >= cutoff);

  return (
    <Panel
      title="Bodyweight log"
      action={<span className="inline-flex items-center gap-1 border px-1.5 py-0.5 font-num text-[10px] uppercase tracking-widest text-muted-foreground" data-testid="badge-bodyweight-readonly"><Eye className="h-3 w-3" /> Read-only</span>}
    >
      {q.isLoading ? (
        <div className="space-y-2" data-testid="client-bodyweight-loading">
          <div className="h-16 animate-pulse rounded-sm bg-muted" />
          {[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded-sm bg-muted/70" />)}
        </div>
      ) : q.isError ? (
        <div className="rounded-sm border border-dashed border-destructive/40 p-4 text-sm" role="alert" data-testid="client-bodyweight-error">
          <p className="font-medium text-destructive">Could not load {athleteName}'s bodyweight.</p>
          <p className="mt-1 text-xs text-muted-foreground">{errMessage(q.error)}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-retry-client-bodyweight">
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} /> Retry
          </Button>
        </div>
      ) : !latest ? (
        <p className="py-4 text-center text-sm text-muted-foreground" data-testid="client-bodyweight-empty">{athleteName} has not logged any bodyweight yet. Lifters record weigh-ins from their own dashboard.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="relative border-l-[3px] border-[#B4975A] bg-secondary/50 p-3" data-testid="client-bodyweight-latest">
            <div className="font-num text-[10px] uppercase tracking-[0.22em] text-primary">Current</div>
            <div className="font-display text-4xl font-bold leading-none">{fmtNum(latest.weight, 2)}<span className="ml-1 text-base">{unitLabel(latest.unit)}</span></div>
            <div className="mt-1 font-num text-[11px] text-muted-foreground">{fmtDate(latest.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</div>
            <div className="font-num text-[11px] text-muted-foreground">{todLabel(latest.timeOfDay)} · recorded in {unitLabel(latest.unit)}</div>
            <div className="mt-2 font-num text-[9px] uppercase tracking-widest text-muted-foreground">{q.isFetching ? "Refreshing…" : "Updates every 60s"}</div>
          </div>
          <div className="min-w-0">
            <div className="mb-1 font-num text-[10px] uppercase tracking-widest text-muted-foreground">{inWindow.length} entr{inWindow.length === 1 ? "y" : "ies"} · {periodLabel(days)}</div>
            {inWindow.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground" data-testid="client-bodyweight-window-empty">No weigh-ins in this period. Choose a longer timeframe to see older entries.</p>
            ) : (
              <ul className="max-h-72 divide-y overflow-auto border-y" data-testid="list-client-bodyweights">
                {inWindow.map((e) => (
                  <li key={`${e.date}-${e.timeOfDay ?? "unspecified"}`} className="flex items-baseline justify-between gap-3 py-2 text-sm" data-testid={`row-client-bodyweight-${e.date}-${e.timeOfDay ?? "unspecified"}`}>
                    <span>
                      <span className="font-medium">{fmtDate(e.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                      <span className="ml-2 font-num text-[11px] text-muted-foreground">{todLabel(e.timeOfDay)}</span>
                    </span>
                    <span className="font-num">{fmtNum(e.weight, 2)} <span className="text-muted-foreground">{unitLabel(e.unit)}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
