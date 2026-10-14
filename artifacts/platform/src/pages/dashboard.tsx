import { BodyweightForm } from "@/components/bodyweight-tracking";
import { TrueMaxButton } from "@/components/true-max-tracking";
import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowRight, CalendarClock, Flag } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getGetAnalyticsQueryKey, useGetAnalytics, type Workout } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LiftTag, LoadingPage, PageHeader, Panel, SignInCallout, Stat } from "@/components/common";
import { useWorkspace } from "@/hooks/use-platform";
import { daysUntil, fmtCompact, fmtDate, fmtNum, LIFT_VAR, PHASE_LABEL, targetLoad } from "@/lib/pl";

export default function Dashboard() {
  const { data, isLoading, isError, error, refetch } = useWorkspace();
  const { isAuthenticated } = useAuth();
  const params = { days: 90 as const };
  const analytics = useGetAnalytics(params, { query: { queryKey: getGetAnalyticsQueryKey(params), staleTime: 20_000 } });

  const derived = useMemo(() => {
    if (!data) return null;
    const me = data.profile.id;
    const mine = data.assignments.filter((a) => a.athleteId === me).sort((a, b) => b.startDate.localeCompare(a.startDate));
    const current = mine[0];
    const mySessions = data.sessions.filter((s) => s.athleteId === me).sort((a, b) => b.date.localeCompare(a.date));
    let next: Workout | null = null;
    if (current) {
      const done = new Set(mySessions.filter((s) => s.assignmentId === current.id && s.status === "completed").map((s) => s.workoutId));
      next = [...current.program.workouts].sort((a, b) => a.week - b.week || a.day - b.day).find((w) => !done.has(w.id)) ?? null;
      const total = current.program.workouts.length;
      return { current, next, mySessions, done: done.size, total };
    }
    return { current, next, mySessions, done: 0, total: 0 };
  }, [data]);

  if (isLoading) return <LoadingPage />;
  if (isError || !data || !derived) return <ErrorState message={(error as Error | null)?.message} onRetry={() => refetch()} />;

  const p = data.profile;
  const meet = p.meetDate ? daysUntil(p.meetDate) : null;
  const total = p.squatMax + p.benchMax + p.deadliftMax;
  const { current, next, mySessions } = derived;
  const trend = analytics.data?.trend ?? [];
  const pct = derived.total ? Math.round((derived.done / derived.total) * 100) : 0;

  return (
    <div>
      <PageHeader kicker={data.demo ? "Navy Powerlifting · Demo athlete" : "Navy Powerlifting · Team training"} title={p.name ? `${p.name.split(" ")[0]}'s training` : "Your training"}>
        <div className="flex flex-wrap gap-2">
        <Link href="/workouts" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" data-testid="link-log-workout">
          Log a session <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
        <BodyweightForm />
        <TrueMaxButton />
        </div>
      </PageHeader>

      {data.demo && !isAuthenticated && (
        <div className="mb-6 rise">
          <SignInCallout text="This is a read-only demo athlete loaded from the server. Sign in to import blocks, log sessions and coach clients." />
        </div>
      )}

      {!data.demo && (total === 0 || !current) && (
        <div className="rise mb-6 grid gap-3 rounded-md border border-dashed border-primary/40 bg-card p-5 md:grid-cols-3" data-testid="panel-getting-started">
          <div className="md:col-span-3 font-display text-2xl font-bold uppercase">Get on the platform</div>
          <Link href="/settings" className={`rounded-sm border p-3 text-sm hover:border-primary ${total > 0 ? "opacity-50" : ""}`} data-testid="link-start-maxes"><b className="font-num text-primary">01</b> Set reference maxes and meet date</Link>
          <Link href="/programs" className={`rounded-sm border p-3 text-sm hover:border-primary ${current ? "opacity-50" : ""}`} data-testid="link-start-assign"><b className="font-num text-primary">02</b> Open a block and assign it to yourself</Link>
          <Link href="/workouts" className="rounded-sm border p-3 text-sm hover:border-primary" data-testid="link-start-log"><b className="font-num text-primary">03</b> Log your first session</Link>
        </div>
      )}

      {/* Attempt board */}
      <div className="rise rise-1 mb-6 overflow-hidden rounded-md bg-sidebar text-sidebar-foreground">
        <div className="plate-stripe h-1" />
        <div className="grid gap-px bg-sidebar-border md:grid-cols-5">
          <div className="bg-sidebar p-5 md:col-span-2">
            <div className="flex items-center gap-2 font-num text-[10px] uppercase tracking-[0.25em] text-sidebar-foreground/50">
              <Flag className="h-3 w-3" /> Meet day
            </div>
            {meet !== null ? (
              <>
                <div className="mt-2 font-display text-7xl font-bold leading-none" data-testid="text-meet-countdown">
                  {meet < 0 ? "Done" : meet}
                  {meet >= 0 && <span className="ml-2 text-xl text-sidebar-foreground/60">days out</span>}
                </div>
                <div className="mt-2 font-num text-xs text-sidebar-foreground/60">{fmtDate(p.meetDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
              </>
            ) : (
              <div className="mt-2">
                <div className="font-display text-3xl font-bold">No meet set</div>
                <Link href="/settings" className="font-num text-xs text-sidebar-primary underline" data-testid="link-set-meet">Set meet date</Link>
              </div>
            )}
          </div>
          {(["squat", "bench", "deadlift"] as const).map((l) => (
            <div key={l} className="relative bg-sidebar p-5">
              <span className="absolute left-0 top-5 h-8 w-1" style={{ background: LIFT_VAR[l] }} />
              <div className="font-num text-[10px] uppercase tracking-[0.25em] text-sidebar-foreground/50">{l} ref max</div>
              <div className="mt-2 font-display text-5xl font-bold leading-none" data-testid={`text-max-${l}`}>
                {fmtNum(l === "squat" ? p.squatMax : l === "bench" ? p.benchMax : p.deadliftMax, 1)}
              </div>
              <div className="font-num text-xs text-sidebar-foreground/50">{p.unit}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-sidebar-border px-5 py-2 font-num text-xs text-sidebar-foreground/60">
          <span>Reference total</span>
          <span className="text-sidebar-foreground" data-testid="text-total">{fmtNum(total, 1)} {p.unit}</span>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Completed · 90d" value={analytics.data?.completedSessions ?? "—"} sub="sessions" accent={LIFT_VAR.squat} />
        <Stat label="Volume · 90d" value={analytics.data ? fmtCompact(analytics.data.totalVolume) : "—"} unit={analytics.data?.unit} sub="external load" accent={LIFT_VAR.bench} />
        <Stat label="Sets · 90d" value={analytics.data?.totalSets ?? "—"} sub={`${analytics.data?.totalReps ?? 0} reps`} accent={LIFT_VAR.deadlift} />
        <Stat label="Block progress" value={`${pct}%`} sub={current ? `${derived.done}/${derived.total} workouts` : "no block assigned"} accent={LIFT_VAR.accessory} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Estimated max trend" className="rise-2 lg:col-span-2" action={<Link href="/progress" className="font-num text-xs text-primary" data-testid="link-progress">Full analytics</Link>}>
          {analytics.isLoading ? (
            <div className="h-64 animate-pulse rounded bg-muted" />
          ) : trend.length === 0 ? (
            <EmptyState title="No completed sessions yet" body="Trends are drawn only from completed sessions. Log one and it shows up here." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ left: -10, right: 8, top: 8 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d)} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} labelFormatter={(d) => fmtDate(String(d), { month: "long", day: "numeric", year: "numeric" })} formatter={(v: number, n: string) => [`${fmtNum(v, 1)} ${analytics.data?.unit ?? ""}`, `${n} e1RM`]} />
                  {(["squat", "bench", "deadlift"] as const).map((l) => (
                    <Line key={l} type="monotone" dataKey={l} stroke={LIFT_VAR[l]} strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Up next" className="rise-3" action={current && <span className="font-num text-[10px] uppercase tracking-widest text-muted-foreground">{PHASE_LABEL[current.program.phase]}</span>}>
          {!current ? (
            <EmptyState title="No block assigned" body="Assign a program to yourself to get a day-by-day plan." action={<Link href="/programs" className="text-sm text-primary underline" data-testid="link-assign-first">Browse programs</Link>} />
          ) : !next ? (
            <div className="text-sm text-muted-foreground">Every workout in <b>{current.program.name}</b> is complete. Time for the next block.</div>
          ) : (
            <div>
              <div className="font-num text-[10px] uppercase tracking-widest text-muted-foreground">{current.program.name} · Week {next.week} · Day {next.day}</div>
              <div className="font-display text-2xl font-bold uppercase" data-testid="text-next-workout">{next.name}</div>
              <ul className="mt-3 divide-y">
                {next.exercises.slice(0, 6).map((ex) => {
                  const t = targetLoad(ex, p);
                  return (
                    <li key={ex.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{ex.name}</div>
                        <LiftTag lift={ex.lift} />
                      </div>
                      <div className="text-right font-num text-xs">
                        <div>Sets: {ex.sets} · Reps: {ex.reps}</div>
                        <div className="text-muted-foreground">Effort: {ex.effort || "—"}{t ? ` · ${t}${p.unit}` : ""}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Link href={`/workouts?assignment=${current.id}&workout=${next.id}`} className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-primary/40 py-2 text-sm text-primary hover:bg-primary/5" data-testid="link-start-next">
                Start this workout <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          )}
        </Panel>

        <Panel title="Weekly load" className="rise-3 lg:col-span-1">
          {trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">Volume appears once completed sessions exist.</p>
          ) : (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ left: -20, right: 4, top: 4 }}>
                  <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v: number) => fmtCompact(v)} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} formatter={(v: number) => [`${fmtNum(v)} ${analytics.data?.unit ?? ""}`, "Volume"]} />
                  <Area type="monotone" dataKey="volume" stroke={LIFT_VAR.bench} fill={LIFT_VAR.bench} fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Recent sessions" className="rise-4 lg:col-span-2" action={<Link href="/workouts" className="font-num text-xs text-primary" data-testid="link-history">History</Link>}>
          {mySessions.length === 0 ? (
            <EmptyState title="Nothing logged" body={isAuthenticated ? "Your history is empty. The first session you log will appear here." : "Sign in to start your own history."} />
          ) : (
            <ul className="divide-y">
              {mySessions.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5" data-testid={`row-session-${s.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 text-center">
                      <div className="font-display text-2xl font-bold leading-none">{fmtDate(s.date, { day: "numeric" })}</div>
                      <div className="font-num text-[10px] uppercase text-muted-foreground">{fmtDate(s.date, { month: "short" })}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="font-num text-[11px] text-muted-foreground">
                        {s.sets.filter((x) => x.completed).length}/{s.sets.length} sets · {fmtNum(s.volume)} {s.unit}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.coachFeedback && <span className="rounded-sm bg-accent px-1.5 py-0.5 font-num text-[10px] text-accent-foreground">feedback</span>}
                    <span className={`rounded-sm px-1.5 py-0.5 font-num text-[10px] uppercase ${s.status === "completed" ? "bg-secondary" : "border border-dashed text-muted-foreground"}`}>{s.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {current && (
        <div className="mt-6 flex items-center gap-2 font-num text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" /> {current.program.name} started {fmtDate(current.startDate, { month: "long", day: "numeric" })}, assigned by {current.coachName}
          <Button variant="link" size="sm" asChild>
            <Link href={`/programs/${current.program.id}`} data-testid="link-current-program">View block</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
