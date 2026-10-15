import { useMemo, useState } from "react";
import { useListAdminSessions, getListAdminSessionsQueryKey, type Session, type LoggedSet } from "@workspace/api-client-react";
import { CheckCircle2, ChevronRight, CircleDashed, History, Lock, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LiftTag } from "@/components/common";
import { errMessage } from "@/hooks/use-platform";
import { fmtDate, fmtNum, parseISODate } from "@/lib/pl";
import { cn } from "@/lib/utils";

export type HistoryTarget = { id: string; name: string; role: "coach" | "client"; coachName: string };

const RANGES = [
  { key: "all", label: "Time to date", months: 0 },
  { key: "6m", label: "6 months", months: 6 },
  { key: "3m", label: "3 months", months: 3 },
  { key: "1m", label: "1 month", months: 1 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const LB_PER_KG = 2.20462;

function fmtStamp(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function sessionTime(s: Session) {
  return parseISODate(s.date)?.getTime() ?? 0;
}

function StatusBadge({ status }: { status: string }) {
  return status === "completed" ? (
    <span className="inline-flex items-center gap-1 border border-[hsl(var(--accessory))]/50 bg-[hsl(var(--accessory))]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--accessory))]" data-testid="status-completed">
      <CheckCircle2 className="h-3 w-3" /> Completed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 border border-dashed border-[#B4975A] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-foreground" data-testid="status-draft">
      <CircleDashed className="h-3 w-3" /> Draft · not finished
    </span>
  );
}

function groupSets(sets: LoggedSet[]) {
  const map = new Map<string, { name: string; lift: string; sets: LoggedSet[] }>();
  for (const s of sets) {
    const k = s.exerciseId || s.exerciseName;
    if (!map.has(k)) map.set(k, { name: s.exerciseName, lift: s.lift, sets: [] });
    map.get(k)!.sets.push(s);
  }
  return [...map.values()].map((g) => ({ ...g, sets: g.sets.slice().sort((a, b) => a.setNumber - b.setNumber) }));
}

function SessionCard({ s }: { s: Session }) {
  const groups = groupSets(s.sets ?? []);
  const done = (s.sets ?? []).filter((x) => x.completed).length;
  const draft = s.status !== "completed";
  return (
    <details className={cn("group/s border bg-card", draft ? "border-dashed border-[#B4975A]/70" : "border-card-border")} data-testid={`session-${s.id}`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2.5">
        <ChevronRight className="h-4 w-4 text-primary transition-transform group-open/s:rotate-90" />
        <span className="font-num text-[11px] uppercase tracking-widest text-muted-foreground" data-testid={`text-session-date-${s.id}`}>{fmtDate(s.date, { year: "numeric", month: "short", day: "numeric" })}</span>
        <span className="font-display text-lg font-bold uppercase">{s.name}</span>
        <StatusBadge status={s.status} />
        <span className="w-full pl-6 font-num text-[11px] text-muted-foreground md:ml-auto md:w-auto md:pl-0">
          {done}/{s.sets?.length ?? 0} sets · {fmtNum(s.volume)} {s.unit} vol · recorded in {s.unit}
        </span>
      </summary>
      <div className="space-y-3 border-t px-3 py-3">
        {groups.length === 0 ? (
          <p className="border border-dashed p-3 text-xs text-muted-foreground">No sets logged.</p>
        ) : (
          <div className="overflow-x-auto border">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/60 font-num text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr><th className="px-3 py-1.5">Exercise</th><th className="px-2">Set</th><th className="px-2">Weight ({s.unit})</th><th className="px-2">Reps</th><th className="px-2">RPE</th><th className="px-2">Done</th><th className="px-3">Notes</th></tr>
              </thead>
              <tbody className="divide-y">
                {groups.map((g) => g.sets.map((st, i) => (
                  <tr key={`${g.name}-${st.setNumber}-${i}`} className={cn("align-top", !st.completed && "text-muted-foreground")}>
                    <td className="px-3 py-1.5">{i === 0 && <div className="space-y-0.5"><div className="font-medium text-foreground">{g.name}</div><LiftTag lift={g.lift} /></div>}</td>
                    <td className="px-2 py-1.5 font-num">{st.setNumber}</td>
                    <td className="px-2 py-1.5 font-num">{fmtNum(st.weight, 1)}</td>
                    <td className="px-2 py-1.5 font-num">{st.reps}</td>
                    <td className="px-2 py-1.5 font-num">{st.rpe > 0 ? st.rpe : <span className="text-muted-foreground">n/r</span>}</td>
                    <td className="px-2 py-1.5 font-num text-[10px] uppercase">{st.completed ? "Yes" : "No"}</td>
                    <td className="max-w-[18rem] whitespace-pre-wrap px-3 py-1.5 text-muted-foreground">{st.notes || ""}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
        <p className="font-num text-[10px] text-muted-foreground">RPE "n/r" = not recorded. Weights shown in the unit the athlete logged ({s.unit}).</p>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="border bg-background p-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Session notes</div>
            <p className="whitespace-pre-wrap text-sm" data-testid={`text-session-notes-${s.id}`}>{s.notes || <span className="text-muted-foreground">None.</span>}</p>
          </div>
          <div className="border border-[#B4975A]/50 bg-[#B4975A]/5 p-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Coach feedback (read-only)</div>
            <p className="whitespace-pre-wrap text-sm" data-testid={`text-session-feedback-${s.id}`}>{s.coachFeedback || <span className="text-muted-foreground">None given.</span>}</p>
          </div>
        </div>
        <p className="font-num text-[10px] text-muted-foreground">Last updated {fmtStamp(s.updatedAt)}</p>
      </div>
    </details>
  );
}

export function SessionHistoryPanel({ target, onClose }: { target: HistoryTarget; onClose: () => void }) {
  const [range, setRange] = useState<RangeKey>("all");
  const q = useListAdminSessions(target.id, {
    query: { queryKey: getListAdminSessionsQueryKey(target.id), enabled: !!target.id, staleTime: 20_000, refetchInterval: 60_000, retry: 2 },
  });

  const sessions = useMemo(() => {
    const months = RANGES.find((r) => r.key === range)?.months ?? 0;
    let cutoff = 0;
    if (months) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - months); cutoff = d.getTime(); }
    return (q.data ?? []).filter((s) => !cutoff || sessionTime(s) >= cutoff)
      .sort((a, b) => sessionTime(b) - sessionTime(a) || b.updatedAt.localeCompare(a.updatedAt));
  }, [q.data, range]);

  const summary = useMemo(() => {
    const completed = sessions.filter((s) => s.status === "completed");
    const lb = completed.filter((s) => s.unit === "lb").reduce((n, s) => n + s.volume, 0);
    const kg = completed.filter((s) => s.unit === "kg").reduce((n, s) => n + s.volume, 0);
    const mixed = lb > 0 && kg > 0;
    return { count: completed.length, drafts: sessions.length - completed.length, last: completed[0], lb, kg, mixed, totalLb: lb + kg * LB_PER_KG };
  }, [sessions]);

  return (
    <div className="rise mt-3 space-y-4 border-l-2 border-primary pl-4" data-testid={`history-${target.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-1.5 font-num text-[10px] uppercase tracking-widest text-muted-foreground"><Lock className="h-3 w-3" /> Read-only workout history</p>
          <h4 className="font-display text-xl font-bold uppercase" data-testid="text-history-name">{target.name}</h4>
          <p className="text-xs text-muted-foreground">{target.role === "coach" ? "Coach's own training log" : `Client of ${target.coachName}`}</p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-refresh-history"><RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", q.isFetching && "animate-spin")} /> Refresh</Button>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close history" data-testid="button-close-history"><X className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => setRange(r.key)} data-testid={`button-range-${r.key}`}
            className={cn("border px-2.5 py-1 font-num text-[11px] uppercase tracking-widest transition-colors", range === r.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary")}>
            {r.label}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="space-y-2" data-testid="history-loading">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse bg-muted" />)}</div>
      ) : q.isError ? (
        <ErrorState message={errMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px border bg-border md:grid-cols-4" data-testid="history-summary">
            <div className="bg-card p-2.5"><div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Completed</div><div className="font-num text-xl font-bold" data-testid="text-completed-count">{summary.count}</div>{summary.drafts > 0 && <div className="font-num text-[10px] text-muted-foreground">+{summary.drafts} draft{summary.drafts === 1 ? "" : "s"}</div>}</div>
            <div className="bg-card p-2.5"><div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Last completed</div><div className="font-num text-sm font-bold" data-testid="text-last-session">{summary.last ? fmtDate(summary.last.date, { year: "numeric", month: "short", day: "numeric" }) : "—"}</div></div>
            <div className="col-span-2 bg-card p-2.5"><div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Completed volume</div>
              <div className="font-num text-sm font-bold" data-testid="text-volume">
                {summary.count === 0 ? "—" : summary.mixed
                  ? <>{fmtNum(summary.lb)} lb + {fmtNum(summary.kg)} kg <span className="font-normal text-muted-foreground">(≈ {fmtNum(summary.totalLb)} lb converted)</span></>
                  : summary.kg > 0 ? `${fmtNum(summary.kg)} kg` : `${fmtNum(summary.lb)} lb`}
              </div>
            </div>
          </div>
          {sessions.length === 0 ? (
            <EmptyState title="No workouts logged" body={range === "all" ? `${target.name} has not logged any sessions yet.` : "No sessions in this time range. Try a wider range."} />
          ) : (
            <div className="space-y-2">{sessions.map((s) => <SessionCard key={s.id} s={s} />)}</div>
          )}
        </>
      )}
    </div>
  );
}

export function HistoryIcon() { return <History className="mr-1.5 h-3.5 w-3.5" />; }
