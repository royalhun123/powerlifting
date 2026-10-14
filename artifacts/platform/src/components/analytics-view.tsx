import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { maxTrendCeiling } from "@/lib/max-trend";
import { getGetAnalyticsQueryKey, useGetAnalytics, type GetAnalyticsDays } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Panel, Stat } from "@/components/common";
import { errMessage } from "@/hooks/use-platform";
import { fmtCompact, fmtDate, fmtNum, LIFT_LABEL, LIFT_VAR } from "@/lib/pl";

const tip = { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12, borderRadius: 4 };

export function AnalyticsView({ athleteId, days }: { athleteId?: string; days: GetAnalyticsDays }) {
  const params = athleteId ? { athleteId, days } : { days };
  const { data, isLoading, isError, error, refetch } = useGetAnalytics(params, { query: { queryKey: getGetAnalyticsQueryKey(params), staleTime: 20_000 } });

  if (isLoading)
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-72" />
      </div>
    );
  if (isError || !data) return <ErrorState message={errMessage(error)} onRetry={() => refetch()} />;

  const u = data.unit;
  if (data.completedSessions === 0 && !data.trend.length)
    return <EmptyState title="No sessions or true maxes in this window" body="Log a true 1RM to start your max history, or complete a workout to track training volume. Drafts and prescriptions are not counted." />;

  const main = ["squat", "bench", "deadlift"];
  const records = [...data.records].sort((a, b) => main.indexOf(a.lift) - main.indexOf(b.lift));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Completed sessions" value={data.completedSessions} accent={LIFT_VAR.squat} />
        <Stat label="External volume" value={fmtCompact(data.totalVolume)} unit={u} accent={LIFT_VAR.bench} />
        <Stat label="Completed sets" value={data.totalSets} accent={LIFT_VAR.deadlift} />
        <Stat label="Completed reps" value={data.totalReps} accent={LIFT_VAR.accessory} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {records.filter((r) => main.includes(r.lift)).map((r) => (
          <div key={r.lift} className="rise relative overflow-hidden rounded-md border border-card-border bg-card p-4" data-testid={`card-record-${r.lift}`}>
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: LIFT_VAR[r.lift] ?? LIFT_VAR.accessory }} />
            <div className="font-display text-xl font-bold uppercase">{LIFT_LABEL[r.lift] ?? r.lift}</div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <div className="font-num text-[10px] uppercase tracking-widest text-muted-foreground">Best actual</div>
                <div className="font-display text-4xl font-bold leading-none">{fmtNum(r.bestWeight, 1)}<span className="ml-1 font-num text-xs text-muted-foreground">{u}</span></div>
              </div>
              <div>
                <div className="font-num text-[10px] uppercase tracking-widest text-muted-foreground">Estimated 1RM</div>
                <div className="font-display text-4xl font-bold leading-none text-primary">{fmtNum(r.estimatedMax, 1)}<span className="ml-1 font-num text-xs text-muted-foreground">{u}</span></div>
              </div>
            </div>
            <div className="mt-3 font-num text-[11px] text-muted-foreground">
              {r.sets} sets · {fmtNum(r.totalVolume)} {u} volume · best on {fmtDate(r.date)}
            </div>
          </div>
        ))}
      </div>

      <Panel title={`1RM trend — actual / RPE 9 estimates (${u})`}>
        {!data.trend.some(point => point.squat !== null || point.bench !== null || point.deadlift !== null) && <p className="mb-3 text-sm text-muted-foreground">No qualifying maxes in this period. Log a tested single at RPE 10 or a set of 1–10 reps at RPE 9.</p>}
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.trend} margin={{ left: -8, right: 8, top: 8 }} maxBarSize={40}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d)} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[0,maxTrendCeiling(data.trend)]} allowDataOverflow tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={tip} labelFormatter={(d) => fmtDate(String(d), { month: "long", day: "numeric", year: "numeric" })} formatter={(v: number, n: string) => [`${fmtNum(v, 1)} ${u}`, `${LIFT_LABEL[n] ?? n} e1RM`]} />
              {main.map((l) => <Bar key={l} dataKey={l} fill={LIFT_VAR[l]} radius={[3,3,0,0]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex gap-4">{main.map((l) => <span key={l} className="flex items-center gap-1.5 font-num text-[11px]"><span className="h-2 w-4 rounded-sm" style={{ background: LIFT_VAR[l] }} />{LIFT_LABEL[l]}</span>)}</div>
      </Panel>

      <Panel title={`Volume per session date (${u})`}>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.trend} margin={{ left: -4, right: 8, top: 8 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d)} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={(v: number) => fmtCompact(v)} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={tip} cursor={{ fill: "hsl(var(--muted))" }} labelFormatter={(d) => fmtDate(String(d), { month: "long", day: "numeric" })} formatter={(v: number) => [`${fmtNum(v)} ${u}`, "Volume"]} />
              <Bar dataKey="volume" fill={LIFT_VAR.bench} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground md:grid-cols-3">
        <div><b className="text-foreground">1RM trend.</b> Actual maxes come from your separate true-1RM log or workout singles at RPE 10. Estimates use only RPE 9 sets of 1–10 reps: weight × (1 + (reps + 1) / 30), allowing one rep in reserve. Lower-effort sets and blank RPE do not generate estimates. Separate max entries do not add workout volume or change programming reference maxes.</div>
        <div><b className="text-foreground">Actual vs estimated.</b> Best actual is the heaviest weight you completed. Estimated max projects what that set implies for one rep.</div>
        <div><b className="text-foreground">External-load volume.</b> Sum of weight × reps on completed sets. Bodyweight is excluded, so a 0-weight set adds nothing. Values shown in {u}.</div>
      </div>
    </div>
  );
}
