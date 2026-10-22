import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queueSession, readDevice } from "@workspace/replit-auth-web";
import { SessionSummary } from "@/components/session-summary";
import { ExerciseContext } from "@/components/exercise-context";
import { WorkoutDiscussion } from "@/components/workout-discussion";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Check, CheckCircle2, Copy, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { useDeleteSession, type Assignment, type LoggedSet, type Session, type SessionInput, type SessionInputStatus, type SessionInputUnit, type Workout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState, ErrorState, LiftTag, LoadingPage, PageHeader, Panel } from "@/components/common";
import { errMessage, useInvalidateAll, useMutationGuard, useWorkspace } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { buildSets, fmtDate, fmtNum, setTargetLoad, isSetPerformed, repRange, todayISO } from "@/lib/pl";
import { cn } from "@/lib/utils";
import type { Profile } from "@workspace/api-client-react";

type LogState = {
  id?: string;
  expected?: string;
  assignment: Assignment;
  workout: Workout;
  date: string;
  unit: SessionInputUnit;
  notes: string;
  sets: LoggedSet[];
};

function numOr0(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function resumeSession(session: Session, assignment: Assignment, workout: Workout): LogState {
  return {
    id: session.id,
    expected: session.updatedAt,
    assignment,
    workout,
    date: session.date,
    unit: session.unit,
    notes: session.notes,
    sets: session.sets.map((set) => ({ ...set })),
  };
}

function openWorkout(assignment: Assignment, workout: Workout, sessions: Session[], profile: Profile): LogState | Session {
  const matching = sessions.filter((session) => session.assignmentId === assignment.id && session.workoutId === workout.id);
  const completed = matching.find((session) => session.status === "completed");
  if (completed) return completed;
  const draft = matching.filter((session) => session.status === "draft").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return draft
    ? resumeSession(draft, assignment, workout)
    : { id: crypto.randomUUID(), expected: "new", assignment, workout, date: todayISO(), unit: profile.unit, notes: "", sets: buildSets(workout.exercises, profile) };
}

function Logger({ state, setState, profile, onDone }: { state: LogState; setState: (s: LogState) => void; profile: Profile; onDone: () => void }) {
  const save = useMutation({
    networkMode: "always",
    mutationFn: ({ data }: { data: SessionInput }) => queueSession(data, state.expected ?? "new"),
  });
  const invalidate = useInvalidateAll();
  const guard = useMutationGuard(true);
  const { toast } = useToast();
  const { workout } = state;
  // Track numeric edits even when the user enters a value equal to a prescription.
  const enteredSets = useRef(new WeakSet<LoggedSet>());

  const setAt = (idx: number, patch: Partial<LoggedSet>) => setState({ ...state, sets: state.sets.map((s, i) => {
    if (i !== idx) return s;
    const updated = { ...s, ...patch };
    updated.completed = isSetPerformed(updated);
    if (enteredSets.current.has(s) || "weight" in patch || "reps" in patch || "rpe" in patch) enteredSets.current.add(updated);
    return updated;
  }) });
  const done = state.sets.filter((s) => s.completed).length;
  const volume = state.sets.filter((s) => s.completed).reduce((t, s) => t + s.weight * s.reps, 0);
  const unitMismatch = state.unit !== profile.unit;

  const submit = (status: SessionInputStatus) => {
    if (!guard()) return;
    if (status === "completed" && !state.sets.some(s => s.completed && s.reps > 0)) {
      toast({ title: "Complete at least one set", description: "Enter actual reps before completing a session.", variant: "destructive" });
      return;
    }
    save.mutate(
      {
        data: {
          id: state.id,
          assignmentId: state.assignment.id,
          workoutId: workout.id,
          name: workout.name,
          date: state.date,
          unit: state.unit,
          status,
          notes: state.notes,
          sets: state.sets.map((s, i) => ({
            ...s,
            setNumber: state.sets.slice(0, i).filter(prior => prior.exerciseId === s.exerciseId).length + 1,
          })),
        },
      },
      {
        onSuccess: async (saved) => {
          await invalidate();
          toast({ title: status === "completed" ? "Session saved on this device" : "Draft saved on this device", description: `${saved.name} · Queued for sync. See sync status above.` });
          if (status === "completed") onDone();
          else setState({ ...state, id: saved.id, expected: saved.updatedAt });
        },
        onError: (e) => toast({ title: "Save failed", description: errMessage(e), variant: "destructive" }),
      },
    );
  };

  return (
    <div className="pb-28">
      <button onClick={onDone} className="mb-4 inline-flex items-center gap-1 font-num text-xs text-muted-foreground hover:text-foreground" data-testid="button-back-to-list">
        <ArrowLeft className="h-3.5 w-3.5" /> All workouts
      </button>
      <div className="rise mb-5">
        <div className="font-num text-[11px] uppercase tracking-[0.22em] text-primary">
          {state.assignment.program.name} · Week {workout.week} · Day {workout.day}
        </div>
        <h1 className="font-display text-4xl font-bold uppercase leading-none md:text-5xl" data-testid="text-logger-title">{workout.name}</h1>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="grid gap-1">
            <Label className="font-num text-[10px] uppercase tracking-widest">Date</Label>
            <Input type="date" value={state.date} onChange={(e) => setState({ ...state, date: e.target.value })} data-testid="input-session-date" />
          </div>
          <div className="grid gap-1">
            <Label className="font-num text-[10px] uppercase tracking-widest">Unit</Label>
            <Select value={state.unit} onValueChange={(v) => setState({
              ...state,
              unit: v as SessionInputUnit,
              sets: state.sets.map(s => ({
                ...s,
                weight: Math.round(s.weight * (state.unit === v ? 1 : v === "kg" ? 1 / 2.2046226218 : 2.2046226218) * 100) / 100,
              })).map((s, i) => {
                if (enteredSets.current.has(state.sets[i])) enteredSets.current.add(s);
                return s;
              }),
            })}>
              <SelectTrigger data-testid="select-session-unit"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lb">lb</SelectItem>
                <SelectItem value="kg">kg</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex items-end gap-4 font-num text-xs">
            <div><div className="text-muted-foreground">sets done</div><div className="font-display text-2xl font-bold" data-testid="text-sets-done">{done}/{state.sets.length}</div></div>
            <div><div className="text-muted-foreground">volume</div><div className="font-display text-2xl font-bold">{fmtNum(volume)} <span className="text-xs">{state.unit}</span></div></div>
          </div>
        </div>
        {unitMismatch && <p className="mt-2 font-num text-[11px] text-muted-foreground">Targets are computed from your reference maxes in {profile.unit}; this session is logged in {state.unit}.</p>}
      </div>

      <div className="space-y-4">
        {!!workout.circuits?.length && <Panel title="Circuits">
          <p className="mb-2 text-sm text-muted-foreground">Do one set of every exercise in the circuit, then rest before the next round. Each logged set below represents one round.</p>
          {workout.circuits.map(c => <div key={c.id} className="mb-2 rounded border p-3 text-sm">
            <strong>{c.name}: {c.rounds} rounds · {c.restSeconds}s rest between rounds</strong>
            <p>{workout.exercises.filter(ex => ex.circuitId === c.id).map(ex => ex.name).join(" → ") || "No exercises"}</p>
          </div>)}
        </Panel>}
        {workout.exercises.map((ex) => {
          const range = repRange(ex.reps);
          const rows = state.sets.map((s, i) => ({ s, i })).filter(({ s }) => s.exerciseId === ex.id);
          // A prescribed weight alone is not a logged result. Preserve all actual
          // numeric entries, including partial sets, and never copy set notes.
          const nextCopyIndex = rows.findIndex(({ s }, index) => {
            if (index === 0 || enteredSets.current.has(s) || s.completed || s.reps !== 0 || s.rpe !== 0) return false;
            const prescribedWeight = setTargetLoad(ex, index, profile, state.unit) ?? 0;
            if (s.weight !== 0 && s.weight !== prescribedWeight) return false;
            return rows.slice(0, index).some(({ s: prior }) => isSetPerformed(prior));
          });
          const copySource = nextCopyIndex < 0 ? undefined : rows.slice(0, nextCopyIndex).reverse().find(({ s }) => isSetPerformed(s));
          return (
            <section key={ex.id} className="rise overflow-hidden rounded-md border border-card-border bg-card" data-testid={`log-exercise-${ex.id}`}>
              <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
                <div>
                  <div className="font-display text-xl font-bold uppercase">{ex.name}</div>
                  <LiftTag lift={ex.lift} />
                  <ExerciseContext exercise={ex} workout={workout} />
                </div>
                <div className="text-right font-num text-xs">
                  <div className="text-sm">Sets: <strong>{ex.sets}</strong> · Target reps: <strong>{ex.reps}</strong></div>
                  <div className="text-primary">Effort: {ex.effort || "—"}</div>
                </div>
                {ex.notes && <p className="w-full text-xs text-muted-foreground">{ex.notes}</p>}
                <p className="w-full text-xs text-muted-foreground">Each set has its own actual weight and reps. Increase or decrease the weight as needed.{range ? ` Aim for ${range.min}–${range.max} reps; log the number you actually complete.` : ` Rep prescription: ${ex.reps}. Log actual reps below.`}</p>
                <p className="w-full text-xs text-muted-foreground">Entering reps records the set automatically once a weight is entered (bodyweight accessories may use 0). RPE is optional; a tested 1RM is a single at RPE 10. Only RPE 9 sets generate estimated maxes.</p>
              </header>
              <div className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-2 px-4 pt-2 font-num text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>Set</span><span>Weight ({state.unit === "lb" ? "lbs" : "kg"})</span><span>Actual reps</span><span>RPE (optional)</span>
              </div>
              <div className="space-y-1.5 px-4 py-2">
                {rows.map(({ s, i }, k) => {
                  return (
                  <div key={i} className="group">
                    <div className={cn("grid grid-cols-[2rem_1fr_1fr_1fr] items-center gap-2 rounded-sm transition-colors", s.completed && "bg-[hsl(var(--accessory)/0.08)]")}>
                      <span className="font-display text-lg font-bold text-muted-foreground">{k + 1}</span>
                      <Input inputMode="decimal" aria-label={`${ex.name} set ${k + 1} actual weight in ${state.unit}`} className="h-11 font-num text-base" placeholder="—" value={s.weight ? String(s.weight) : ""} onChange={(e) => setAt(i, { weight: numOr0(e.target.value) })} data-testid={`input-set-weight-${i}`} />
                      <Input inputMode="numeric" aria-label={`${ex.name} set ${k + 1} actual reps`} className="h-11 font-num text-base" value={s.reps ? String(s.reps) : ""} placeholder="Done" onChange={(e) => setAt(i, { reps: Math.round(numOr0(e.target.value)) })} data-testid={`input-set-reps-${i}`} />
                      <Input inputMode="decimal" className="h-11 font-num text-base" value={s.rpe ? String(s.rpe) : ""} placeholder="—" onChange={(e) => setAt(i, { rpe: Math.min(10, numOr0(e.target.value)) })} data-testid={`input-set-rpe-${i}`} />
                    </div>
                    <div className="ml-10 mt-1 flex flex-wrap items-center gap-2">
                      <Input className="h-7 text-xs" placeholder="Set note" value={s.notes} onChange={(e) => setAt(i, { notes: e.target.value })} data-testid={`input-set-notes-${i}`} />
                      <button className="text-muted-foreground hover:text-destructive" onClick={() => setState({ ...state, sets: state.sets.filter((_, j) => j !== i) })} aria-label="Remove set" data-testid={`button-remove-set-${i}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {s.notes && <div className="ml-10 mt-0.5 text-[11px] text-muted-foreground group-focus-within:hidden">{s.notes}</div>}
                  </div>
                );})}
              </div>
              <div className="flex flex-wrap items-center gap-4 px-4 pb-3">
                <button
                  type="button"
                  className="inline-flex items-center font-num text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!copySource}
                  onClick={() => {
                    if (!copySource || nextCopyIndex < 0) return;
                    const { weight, reps, rpe } = copySource.s;
                    setAt(rows[nextCopyIndex].i, { weight, reps, rpe });
                  }}
                  data-testid={`button-copy-next-set-${ex.id}`}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" /> Copy next set
                </button>
                <button
                  className="inline-flex items-center font-num text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    const lastIdx = rows[rows.length - 1]?.i ?? state.sets.length - 1;
                    const ns: LoggedSet = { exerciseId: ex.id, exerciseName: ex.name, lift: ex.lift, setNumber: rows.length + 1, weight: setTargetLoad(ex, rows.length, profile, state.unit) ?? 0, reps: 0, rpe: 0, completed: false, notes: "" };
                    const arr = [...state.sets];
                    arr.splice(lastIdx + 1, 0, ns);
                    setState({ ...state, sets: arr });
                  }}
                  data-testid={`button-add-set-${ex.id}`}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> add set
                </button>
              </div>
            </section>
          );
        })}
        <Panel title="Session notes">
          <Textarea value={state.notes} onChange={(e) => setState({ ...state, notes: e.target.value })} placeholder="How did it move? Sleep, bar speed, anything your group leader should know." data-testid="input-session-notes" />
        </Panel>
        {state.id && state.expected !== "new" && navigator.onLine && <WorkoutDiscussion session={{ id: state.id, sets: state.sets }} />}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-4 py-3 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
          <span className="hidden font-num text-xs text-muted-foreground sm:block">{done === 0 ? "No sets marked complete yet" : `${done} sets complete`}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => submit("draft")} disabled={save.isPending} data-testid="button-save-draft">Save draft</Button>
            <Button onClick={() => submit("completed")} disabled={save.isPending} data-testid="button-complete-session">
              <CheckCircle2 className="mr-2 h-4 w-4" /> {save.isPending ? "Saving…" : "Complete session"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Workouts() {
  const { data, isLoading, isError, error, refetch } = useWorkspace();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const del = useDeleteSession();
  const invalidate = useInvalidateAll();
  const guard = useMutationGuard();
  const { toast } = useToast();
  const [log, setLog] = useState<LogState | null>(null);
  const [viewedSession,setViewedSession]=useState<Session|null>(null);
  const [pickedAssignment, setPickedAssignment] = useState<string>("");
  const [toDelete, setToDelete] = useState<Session | null>(null);
  const [consumedQuery, setConsumedQuery] = useState("");
  const [commentsFor, setCommentsFor] = useState("");

  const mine = useMemo(() => {
    if (!data) return { assignments: [] as Assignment[], sessions: [] as Session[] };
    const me = data.profile.id;
    return {
      assignments: data.assignments.filter((a) => a.athleteId === me && !a.archived).sort((a, b) => b.startDate.localeCompare(a.startDate)),
      sessions: data.sessions.filter((s) => s.athleteId === me).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)),
    };
  }, [data]);

  // Deep link: /workouts?assignment=..&workout=..
  if (data && search && search !== consumedQuery && !log) {
    const q = new URLSearchParams(search);
    const a = mine.assignments.find((x) => x.id === q.get("assignment"));
    const w = a?.program.workouts.find((x) => x.id === q.get("workout"));
    setConsumedQuery(search);
    if (a) setPickedAssignment(a.id);
    if (a && w) {
      const opened = openWorkout(a, w, mine.sessions, data.profile);
      if ("status" in opened) setViewedSession(opened);
      else setLog(opened);
    }
  }

  if (isLoading) return <LoadingPage />;
  if (isError || !data) return <ErrorState message={errMessage(error)} onRetry={() => refetch()} />;

  if (log) {
    return (
      <Logger
        state={log}
        setState={setLog}
        profile={data.profile}
        onDone={() => {
          setLog(null);
          setLocation("/workouts");
        }}
      />
    );
  }

  const active = mine.assignments.find((a) => a.id === pickedAssignment) ?? mine.assignments[0];
  const start = (a: Assignment, w: Workout) => {
    const opened = openWorkout(a, w, mine.sessions, data.profile);
    if ("status" in opened) setViewedSession(opened);
    else setLog(opened);
  };
  const edit = (s: Session) => {
    const a = data.assignments.find((x) => x.id === s.assignmentId);
    const w = a?.program.workouts.find((x) => x.id === s.workoutId);
    if (!a || !w) {
      toast({ title: "Cannot edit", description: "The assignment for this session no longer exists.", variant: "destructive" });
      return;
    }
    setLog(resumeSession(s, a, w));
  };
  const confirmDelete = async () => {
    if (!toDelete || !guard()) return;
    if (!navigator.onLine) {
      toast({ title: "Connect to delete", description: "Offline session saves are supported; deletion requires an online connection.", variant: "destructive" });
      return;
    }
    const device = await readDevice();
    if (device.entries.some(entry => entry.input.id === toDelete.id && entry.status !== "synced")) {
      toast({ title: "Sync this workout first", description: "Resolve pending saves before deleting a session.", variant: "destructive" });
      return;
    }
    del.mutate(
      { id: toDelete.id },
      {
        onSuccess: async () => {
          await invalidate();
          setToDelete(null);
          toast({ title: "Session deleted" });
        },
        onError: (e) => toast({ title: "Delete failed", description: errMessage(e), variant: "destructive" }),
      },
    );
  };

  const doneIds = new Set(mine.sessions.filter((s) => active && s.assignmentId === active.id && s.status === "completed").map((s) => s.workoutId));
  const draftIds = new Set(mine.sessions.filter((s) => active && s.assignmentId === active.id && s.status === "draft").map((s) => s.workoutId));
  const byWeek = new Map<number, Workout[]>();
  for (const w of active?.program.workouts ?? []) byWeek.set(w.week, [...(byWeek.get(w.week) ?? []), w]);

  return (
    <div>
      <SessionSummary session={viewedSession} onClose={()=>{setViewedSession(null);setLocation("/workouts");}} />
      <PageHeader kicker="Train" title="Workouts">
        {mine.assignments.length > 1 && (
          <Select value={active?.id} onValueChange={setPickedAssignment}>
            <SelectTrigger className="w-64" data-testid="select-assignment"><SelectValue /></SelectTrigger>
            <SelectContent>
              {mine.assignments.map((a) => <SelectItem key={a.id} value={a.id}>{a.program.name} · {a.startDate}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {!active ? (
            <EmptyState title="No block assigned to you" body={"Open Programs and assign a block to yourself to start logging."} action={<Button variant="outline" onClick={() => setLocation("/programs")} data-testid="button-go-programs">Programs</Button>} />
          ) : (
            <div className="space-y-5">
              {[...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([wk, ws]) => (
                <div key={wk} className="rise">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="font-display text-xl font-bold uppercase">Week {wk}</span>
                    <span className="h-px flex-1 bg-border" />
                    <span className="font-num text-[10px] text-muted-foreground">{ws.filter((w) => doneIds.has(w.id)).length}/{ws.length}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ws.sort((a, b) => a.day - b.day).map((w) => {
                      const done = doneIds.has(w.id);
                      return (
                        <button key={w.id} onClick={() => start(active, w)} className={cn("group flex items-start gap-3 rounded-md border bg-card p-3 text-left transition-transform hover:-translate-y-0.5 hover:border-primary/50", done && "opacity-70")} data-testid={`button-start-workout-${w.id}`}>
                          <div className={cn("flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-sm", done ? "bg-[hsl(var(--accessory))] text-primary-foreground" : "bg-secondary")}>
                            {done ? <Check className="h-5 w-5" /> : <><span className="font-num text-[8px] uppercase">day</span><span className="font-display text-lg font-bold leading-none">{w.day}</span></>}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium group-hover:text-primary">{w.name}</div>
                            <div className="truncate font-num text-[11px] text-muted-foreground">{w.exercises.map((e) => e.name).slice(0, 3).join(" · ")}</div>
                            {draftIds.has(w.id) && <span className="font-num text-[10px] uppercase tracking-widest text-primary">draft saved</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Panel title="History" className="h-fit">
          {mine.sessions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground" data-testid="status-history-empty">No sessions logged yet. Your first one lands here.</p>
          ) : (
            <ul className="-my-2 divide-y">
              {mine.sessions.map((s) => (
                <li key={s.id} className="py-3" data-testid={`row-history-${s.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-num text-[10px] uppercase tracking-widest text-muted-foreground">{fmtDate(s.date, { weekday: "short", month: "short", day: "numeric" })} · {s.unit}</div>
                      <button className="text-left font-medium hover:underline" onClick={()=>setViewedSession(s)}>{s.name}</button>
                      <div className="font-num text-[11px] text-muted-foreground">
                        {s.sets.filter((x) => x.completed).length}/{s.sets.length} sets · {fmtNum(s.volume)} {s.unit} ·{" "}
                        <span className={s.status === "completed" ? "text-foreground" : "text-primary"}>{s.status}</span>
                      </div>
                    </div>
                    <div className="flex">
                      <Button variant="ghost" size="icon" onClick={() => edit(s)} aria-label="Edit" data-testid={`button-edit-session-${s.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => (guard() ? setToDelete(s) : undefined)} aria-label="Delete" data-testid={`button-delete-session-${s.id}`}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {s.notes && <p className="mt-1 text-xs text-muted-foreground">{s.notes}</p>}
                  <button type="button" aria-expanded={commentsFor === s.id} onClick={() => setCommentsFor(commentsFor === s.id ? "" : s.id)} className="mt-2 inline-flex items-center gap-1 font-num text-[11px] uppercase tracking-widest text-primary hover:underline" data-testid={`button-comments-${s.id}`}>
                    <MessageSquare className="h-3.5 w-3.5" /> {commentsFor === s.id ? "Hide comments" : `Comments${s.discussions?.length ? ` (${s.discussions.length})` : s.coachFeedback ? " · feedback" : ""}`}
                  </button>
                  {commentsFor === s.id && <WorkoutDiscussion session={s} className="mt-2" />}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>{toDelete?.name} on {toDelete ? fmtDate(toDelete.date) : ""}. Sets and group leader feedback are removed permanently and analytics will update.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={confirmDelete} data-testid="button-confirm-delete-session">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
