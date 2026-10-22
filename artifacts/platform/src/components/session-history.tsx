import { useMemo, useState, type ReactNode } from "react";
import { useListAdminSessions, getListAdminSessionsQueryKey, type Assignment, type Session, type LoggedSet } from "@workspace/api-client-react";
import { CheckCircle2, ChevronRight, CircleDashed, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, LiftTag } from "@/components/common";
import { WorkoutDiscussion } from "@/components/workout-discussion";
import { errMessage } from "@/hooks/use-platform";
import { fmtDate, fmtNum, parseISODate } from "@/lib/pl";
import { cn } from "@/lib/utils";

export const RANGES = [
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
function sessionTime(s: Session) { return parseISODate(s.date)?.getTime() ?? 0; }

function StatusBadge({ status }: { status: string }) {
  return status === "completed" ? (
    <span className="inline-flex items-center gap-1 border border-[hsl(var(--accessory))]/50 bg-[hsl(var(--accessory))]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--accessory))]" data-testid="status-completed"><CheckCircle2 className="h-3 w-3" /> Completed</span>
  ) : (
    <span className="inline-flex items-center gap-1 border border-dashed border-[#B4975A] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-foreground" data-testid="status-draft"><CircleDashed className="h-3 w-3" /> Draft · not finished</span>
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

/** Read-only session card. Comments load lazily only once expanded. */
export function SessionCard({ s }: { s: Session }) {
  const [open, setOpen] = useState(false);
  const groups = groupSets(s.sets ?? []);
  const done = (s.sets ?? []).filter((x) => x.completed).length;
  const draft = s.status !== "completed";
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)} className={cn("group/s border bg-card", draft ? "border-dashed border-[#B4975A]/70" : "border-card-border")} data-testid={`session-${s.id}`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2.5">
        <ChevronRight className="h-4 w-4 text-primary transition-transform group-open/s:rotate-90" />
        <span className="font-num text-[11px] uppercase tracking-widest text-muted-foreground" data-testid={`text-session-date-${s.id}`}>{fmtDate(s.date, { year: "numeric", month: "short", day: "numeric" })}</span>
        <span className="font-display text-lg font-bold uppercase">{s.name}</span>
        <StatusBadge status={s.status} />
        <span className="w-full pl-6 font-num text-[11px] text-muted-foreground md:ml-auto md:w-auto md:pl-0">{done}/{s.sets?.length ?? 0} sets · {fmtNum(s.volume)} {s.unit} vol</span>
      </summary>
      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          {groups.length === 0 ? <p className="border border-dashed p-3 text-xs text-muted-foreground">No sets logged.</p> : (
            <div className="overflow-x-auto border">
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary/60 font-num text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr><th className="px-3 py-1.5">Exercise</th><th className="px-2">Set</th><th className="px-2">Weight ({s.unit})</th><th className="px-2">Reps</th><th className="px-2">RPE</th><th className="px-2">Done</th><th className="px-3">Notes</th></tr>
                </thead>
                <tbody className="divide-y">
                  {groups.map((g) => g.sets.map((st, i) => (
                    <tr key={`${g.name}-${st.setNumber}-${i}`} className={cn("align-top", !st.completed && "text-muted-foreground")}>
                      <td className="px-3 py-1.5">{i === 0 && <div className="space-y-0.5"><div className="font-medium text-foreground">{g.name}</div><LiftTag lift={g.lift} />{st.context && <p className="text-xs text-primary">{st.context}</p>}</div>}</td>
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
          <p className="font-num text-[10px] text-muted-foreground">RPE "n/r" = not recorded. Weights in the unit logged ({s.unit}).</p>
          <div className="border bg-background p-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Session notes</div>
            <p className="whitespace-pre-wrap text-sm" data-testid={`text-session-notes-${s.id}`}>{s.notes || <span className="text-muted-foreground">None.</span>}</p>
          </div>
          <WorkoutDiscussion session={s} readOnly />
          <p className="font-num text-[10px] text-muted-foreground">Last updated {fmtStamp(s.updatedAt)}</p>
        </div>
      )}
    </details>
  );
}

function Summary({ sessions }: { sessions: Session[] }) {
  const completed = sessions.filter((s) => s.status === "completed");
  const lb = completed.filter((s) => s.unit === "lb").reduce((n, s) => n + s.volume, 0);
  const kg = completed.filter((s) => s.unit === "kg").reduce((n, s) => n + s.volume, 0);
  const drafts = sessions.length - completed.length;
  const vol = completed.length === 0 ? "—" : lb > 0 && kg > 0 ? `${fmtNum(lb)} lb + ${fmtNum(kg)} kg (≈ ${fmtNum(lb + kg * LB_PER_KG)} lb)` : kg > 0 ? `${fmtNum(kg)} kg` : `${fmtNum(lb)} lb`;
  return (
    <span className="font-num text-[11px] text-muted-foreground" data-testid="text-group-summary">
      {completed.length} completed{drafts ? ` · ${drafts} draft${drafts === 1 ? "" : "s"}` : ""} · {vol}
    </span>
  );
}

function statusOf(a: Assignment) { return a.removed ? "removed" : a.archived ? "archived" : "running"; }

/** Blocks with the athlete's actual logged sessions grouped under each, plus orphans. */
export function GroupedHistory({ personId, blocks, renderBlock }: { personId: string; blocks: Assignment[]; renderBlock: (a: Assignment) => ReactNode }) {
  const [range, setRange] = useState<RangeKey>("all");
  const q = useListAdminSessions(personId, {
    query: { queryKey: getListAdminSessionsQueryKey(personId), enabled: !!personId, staleTime: 30_000, refetchInterval: 60_000, retry: 2 },
  });
  const sorted = useMemo(() => {
    const months = RANGES.find((r) => r.key === range)?.months ?? 0;
    let cutoff = 0;
    if (months) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - months); cutoff = d.getTime(); }
    return (q.data ?? []).filter((s) => !cutoff || sessionTime(s) >= cutoff).sort((a, b) => sessionTime(b) - sessionTime(a) || b.updatedAt.localeCompare(a.updatedAt));
  }, [q.data, range]);
  const orderedBlocks = useMemo(() => blocks.slice().sort((a, b) => Number(!!a.removed) - Number(!!b.removed) || Number(!!a.archived) - Number(!!b.archived) || b.startDate.localeCompare(a.startDate)), [blocks]);
  const ids = new Set(blocks.map((b) => b.id));
  const other = sorted.filter((s) => !ids.has(s.assignmentId));

  return (
    <div className="space-y-3" data-testid={`grouped-history-${personId}`}>
      <div className="flex flex-wrap items-center gap-1">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => setRange(r.key)} data-testid={`button-range-${r.key}`}
              className={cn("border px-2.5 py-1 font-num text-[11px] uppercase tracking-widest transition-colors", range === r.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary")}>{r.label}</button>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-refresh-history"><RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", q.isFetching && "animate-spin")} /> Refresh</Button>
      </div>
      {q.isError && <ErrorState message={errMessage(q.error)} onRetry={() => q.refetch()} />}
      {orderedBlocks.length === 0 && <p className="border border-dashed p-3 text-xs text-muted-foreground">No blocks assigned.</p>}
      {orderedBlocks.map((a) => {
        const list = sorted.filter((s) => s.assignmentId === a.id);
        const st = statusOf(a);
        return (
          <div key={a.id} className={cn("space-y-2 border-l-2 pl-3", st === "running" ? "border-primary" : "border-dashed border-muted-foreground/40")} data-testid={`block-group-${a.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("border px-1.5 py-0.5 font-num text-[10px] uppercase tracking-widest", st === "running" ? "border-primary text-primary" : st === "removed" ? "border-destructive/60 text-destructive" : "text-muted-foreground")} data-testid={`status-block-${a.id}`}>{st}</span>
              {!q.isLoading && !q.isError && <Summary sessions={list} />}
            </div>
            {renderBlock(a)}
            <div className="space-y-2 pl-2">
              {q.isLoading ? <div className="h-10 animate-pulse bg-muted" /> : q.isError ? null : list.length === 0
                ? <p className="text-xs text-muted-foreground">No workouts logged for this block{range !== "all" ? " in this range" : ""}.</p>
                : list.map((s) => <SessionCard key={s.id} s={s} />)}
            </div>
          </div>
        );
      })}
      {!q.isLoading && !q.isError && other.length > 0 && (
        <div className="space-y-2 border-l-2 border-[#B4975A] pl-3" data-testid={`other-history-${personId}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-foreground">Other workout history</span>
            <Summary sessions={other} />
          </div>
          <p className="text-xs text-muted-foreground">Sessions whose block is no longer on record.</p>
          {other.map((s) => <SessionCard key={s.id} s={s} />)}
        </div>
      )}
    </div>
  );
}
