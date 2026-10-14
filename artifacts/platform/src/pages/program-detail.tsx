import { useEffect, useMemo, useRef, useState } from "react";
import { AssignmentOverview } from "@/components/assignment-overview";
import { Link, useParams } from "wouter";
import { AlertTriangle, ArrowLeft, CalendarPlus, Check, Plus, Save, Trash2 } from "lucide-react";
import { useAssignProgram, useSaveProgram, type Exercise, type ExerciseLift, type ProgramInput, type ProgramInputPhase, type Workout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, LiftTag, LoadingPage } from "@/components/common";
import { errMessage, useInvalidateAll, useMutationGuard, useWorkspace } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { LIFT_LABEL, newId, PHASE_LABEL, targetLoad, todayISO } from "@/lib/pl";
import { PhaseBadge } from "@/pages/programs";

function blankExercise(): Exercise {
  return { id: newId("ex"), name: "New exercise", sets: "3", reps: "5", effort: "RPE 7", weight: "", notes: "", review: false, lift: "accessory" };
}

export default function ProgramDetail() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useWorkspace();
  const save = useSaveProgram();
  const assign = useAssignProgram();
  const invalidate = useInvalidateAll();
  const guard = useMutationGuard();
  const { toast } = useToast();
  const program = data?.programs.find((p) => p.id === params.id);
  const [draft, setDraft] = useState<ProgramInput | null>(null);
  const [dirty, setDirty] = useState(false);
  const [week, setWeek] = useState(1);
  const [assignOpen, setAssignOpen] = useState(false);
  const [athleteId, setAthleteId] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const initFor = useRef<string | null>(null);
  const editVersion = useRef(0);

  useEffect(() => {
    if (program && initFor.current !== program.id) {
      initFor.current = program.id;
      const { source: _s, reviewCount: _r, ...rest } = program;
      void _s; void _r;
      setDraft(JSON.parse(JSON.stringify(rest)) as ProgramInput);
      setDirty(false);
      const weeks = program.workouts.map((w) => w.week);
      setWeek(weeks.length ? Math.min(...weeks) : 1);
    }
  }, [program]);

  const weeks = useMemo(() => {
    if (!draft) return [] as number[];
    const s = new Set<number>(draft.workouts.map((w) => w.week));
    for (let i = 1; i <= draft.weeks; i++) s.add(i);
    return [...s].sort((a, b) => a - b);
  }, [draft]);

  if (isLoading) return <LoadingPage />;
  if (isError || !data) return <ErrorState message={errMessage(error)} onRetry={() => refetch()} />;
  if (!program) return <EmptyState title="Program not found" body="It may have been deleted or belongs to another workspace." action={<Link href="/programs" className="text-primary underline" data-testid="link-back-programs">Back to programs</Link>} />;
  if (!draft) return <LoadingPage />;

  const update = (patch: Partial<ProgramInput>) => {
    editVersion.current++;
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };
  const updateWorkout = (wid: string, patch: Partial<Workout>) => update({ workouts: draft.workouts.map((w) => (w.id === wid ? { ...w, ...patch } : w)) });
  const updateExercise = (wid: string, eid: string, patch: Partial<Exercise>) =>
    update({ workouts: draft.workouts.map((w) => (w.id === wid ? { ...w, exercises: w.exercises.map((e) => (e.id === eid ? { ...e, ...patch } : e)) } : w)) });

  const weekWorkouts = draft.workouts.filter((w) => w.week === week).sort((a, b) => a.day - b.day);
  const reviewCount = draft.workouts.reduce((n, w) => n + w.exercises.filter((e) => e.review).length, 0);

  const addWorkout = () => {
    const used = new Set(weekWorkouts.map((w) => w.day));
    let day = 1;
    while (used.has(day) && day < 7) day++;
    update({ workouts: [...draft.workouts, { id: newId("wo"), name: `Week ${week} Day ${day}`, week, day, exercises: [blankExercise()] }] });
  };

  const doSave = () => {
    if (!guard()) return;
    const savingVersion=editVersion.current;
    save.mutate(
      { data: { ...draft, id: program.id } },
      {
        onSuccess: async (saved) => {
          if(editVersion.current===savingVersion) {
            const {source:_source,reviewCount:_review,...rest}=saved;
            setDraft(rest);
            setDirty(false);
          }
          await invalidate();
          toast({ title: "Program saved" });
        },
        onError: (e) => toast({ title: "Save failed", description: errMessage(e), variant: "destructive" }),
      },
    );
  };

  const doAssign = () => {
    if (!guard()) return;
    if (!athleteId) return;
    assign.mutate(
      { data: { programId: program.id, athleteId, startDate } },
      {
        onSuccess: async (a) => {
          await invalidate();
          setAssignOpen(false);
          toast({ title: "Assigned", description: `${a.program.name} → ${a.athleteName}, starting ${a.startDate}` });
        },
        onError: (e) => toast({ title: "Assignment failed", description: errMessage(e), variant: "destructive" }),
      },
    );
  };

  const assignedTo = data.assignments.filter((a) => a.program.id === program.id);

  return (
    <div className="pb-24">
      <Link href="/programs" className="mb-4 inline-flex items-center gap-1 font-num text-xs text-muted-foreground hover:text-foreground" data-testid="link-back">
        <ArrowLeft className="h-3.5 w-3.5" /> Programs
      </Link>

      <div className="rise mb-6 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <Input value={draft.name} onChange={(e) => update({ name: e.target.value })} className="h-auto border-0 bg-transparent px-0 font-display text-4xl font-bold uppercase shadow-none focus-visible:ring-0 md:text-5xl" data-testid="input-program-name" />
          <Textarea value={draft.description} onChange={(e) => update({ description: e.target.value })} placeholder="Block intent, progression notes…" className="min-h-[60px] bg-card" data-testid="input-description" />
          <div className="flex flex-wrap items-center gap-3">
            <Select value={draft.phase} onValueChange={(v) => update({ phase: v as ProgramInputPhase })}>
              <SelectTrigger className="w-36" data-testid="select-phase"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PHASE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Label className="font-num text-xs">Weeks</Label>
              <Input type="number" min={1} max={52} value={draft.weeks} onChange={(e) => update({ weeks: Math.max(1, Math.min(52, Number(e.target.value) || 1)) })} className="w-20" data-testid="input-weeks" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={draft.archived} onCheckedChange={(v) => update({ archived: v })} data-testid="switch-archived" /> Archived
            </label>
            <PhaseBadge phase={draft.phase} />
            <span className="font-num text-[11px] text-muted-foreground">source: {program.source || "manual"}</span>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Button variant="outline" onClick={() => (guard() ? setAssignOpen(true) : undefined)} data-testid="button-assign">
            <CalendarPlus className="mr-2 h-4 w-4" /> Assign
          </Button>
          <Button onClick={doSave} disabled={save.isPending || !dirty} data-testid="button-save-program">
            <Save className="mr-2 h-4 w-4" /> {save.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </div>

      <AssignmentOverview programId={program.id} />
      {reviewCount > 0 && (
        <div className="rise mb-5 flex items-start gap-3 rounded-md border border-[hsl(var(--deadlift))] bg-[hsl(var(--deadlift)/0.12)] p-4" data-testid="alert-import-review">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "hsl(var(--deadlift))" }} />
          <div className="text-sm">
            <div className="font-semibold">Import review: {reviewCount} prescription{reviewCount === 1 ? "" : "s"} flagged</div>
            Rep ranges, including Excel date-formatted ranges, are accepted automatically. Only remaining ambiguous notes or manually flagged prescriptions need review. Check those rows, clear the flag, and save.
          </div>
        </div>
      )}

      {assignedTo.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2 font-num text-[11px] text-muted-foreground">
          Assigned:
          {assignedTo.map((a) => (
            <span key={a.id} className="rounded-sm bg-secondary px-1.5 py-0.5 text-secondary-foreground">{a.athleteName} · {a.startDate}</span>
          ))}
        </div>
      )}

      <div className="mb-4 flex gap-1 overflow-x-auto border-b">
        {weeks.map((w) => {
          const flagged = draft.workouts.some((x) => x.week === w && x.exercises.some((e) => e.review));
          return (
            <button key={w} onClick={() => setWeek(w)} className={`relative shrink-0 px-4 py-2 font-display text-lg uppercase tracking-wide ${w === week ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`} data-testid={`tab-week-${w}`}>
              Wk {w}
              {flagged && <span className="absolute right-1 top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: "hsl(var(--deadlift))" }} />}
              {w === week && <span className="absolute inset-x-2 -bottom-px h-[3px] bg-primary" />}
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {weekWorkouts.length === 0 && <EmptyState title={`Week ${week} is empty`} body="Add a training day to this week." />}
        {weekWorkouts.map((w) => (
          <div key={w.id} className="rise rounded-md border border-card-border bg-card" data-testid={`card-workout-${w.id}`}>
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
              <span className="font-num text-[10px] uppercase tracking-widest text-muted-foreground">Day</span>
              <Input type="number" min={1} max={7} value={w.day} onChange={(e) => updateWorkout(w.id, { day: Math.max(1, Math.min(7, Number(e.target.value) || 1)) })} className="h-8 w-14" data-testid={`input-day-${w.id}`} />
              <Input value={w.name} onChange={(e) => updateWorkout(w.id, { name: e.target.value })} className="h-8 flex-1 font-display text-lg uppercase" data-testid={`input-workout-name-${w.id}`} />
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => update({ workouts: draft.workouts.filter((x) => x.id !== w.id) })} data-testid={`button-remove-workout-${w.id}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="divide-y">
              {w.exercises.map((ex) => {
                const t = targetLoad(ex, data.profile);
                return (
                  <div key={ex.id} className={`px-4 py-3 ${ex.review ? "bg-[hsl(var(--deadlift)/0.08)]" : ""}`} data-testid={`row-exercise-${ex.id}`}>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-[1.6fr_.8fr_.5fr_.6fr_.8fr_auto] md:items-center">
                      <label className="col-span-2 grid gap-1 text-xs font-medium md:col-span-1">Exercise
                        <Input value={ex.name} onChange={(e) => updateExercise(w.id, ex.id, { name: e.target.value })} data-testid={`input-ex-name-${ex.id}`} />
                      </label>
                      <div className="grid gap-1 text-xs font-medium"><span>Lift type</span>
                      <Select value={ex.lift} onValueChange={(v) => updateExercise(w.id, ex.id, { lift: v as ExerciseLift })}>
                        <SelectTrigger data-testid={`select-lift-${ex.id}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(LIFT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      </div>
                      <label className="grid gap-1 text-xs font-medium">Sets
                        <Input value={ex.sets} onChange={(e) => updateExercise(w.id, ex.id, { sets: e.target.value })} className="font-num" placeholder="3" data-testid={`input-sets-${ex.id}`} />
                      </label>
                      <label className="grid gap-1 text-xs font-medium">Reps / range
                        <Input value={ex.reps} onChange={(e) => updateExercise(w.id, ex.id, { reps: e.target.value })} className="font-num" placeholder="8-12" data-testid={`input-reps-${ex.id}`} />
                      </label>
                      <label className="grid gap-1 text-xs font-medium">Effort
                        <Input value={ex.effort} onChange={(e) => updateExercise(w.id, ex.id, { effort: e.target.value })} className="font-num" placeholder="85% / RPE 8" data-testid={`input-effort-${ex.id}`} />
                      </label>
                      <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => updateWorkout(w.id, { exercises: w.exercises.filter((e) => e.id !== ex.id) })} data-testid={`button-remove-ex-${ex.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground"><strong>Sets: {ex.sets || "—"}</strong> · <strong>Target reps: {ex.reps || "—"}</strong> · Effort: {ex.effort || "—"}. Enter a fixed rep count or a range such as 8-12; actual reps are logged separately for every set.</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <LiftTag lift={ex.lift} />
                      {t !== null && <span className="font-num text-[11px] text-muted-foreground">target ≈ {t} {data.profile.unit} from ref max</span>}
                      <Input value={ex.notes} onChange={(e) => updateExercise(w.id, ex.id, { notes: e.target.value })} placeholder="Notes" className="h-8 min-w-[180px] flex-1 text-xs" data-testid={`input-notes-${ex.id}`} />
                      {ex.review ? (
                        <Button size="sm" variant="outline" className="h-8 border-[hsl(var(--deadlift))]" onClick={() => updateExercise(w.id, ex.id, { review: false })} data-testid={`button-clear-review-${ex.id}`}>
                          <Check className="mr-1.5 h-3.5 w-3.5" /> Mark reviewed
                        </Button>
                      ) : (
                        <button className="font-num text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground" onClick={() => updateExercise(w.id, ex.id, { review: true })} data-testid={`button-flag-review-${ex.id}`}>
                          flag for review
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2">
              <Button variant="ghost" size="sm" onClick={() => updateWorkout(w.id, { exercises: [...w.exercises, blankExercise()] })} data-testid={`button-add-exercise-${w.id}`}>
                <Plus className="mr-1.5 h-4 w-4" /> Exercise
              </Button>
            </div>
          </div>
        ))}
        <Button variant="outline" onClick={addWorkout} className="w-full border-dashed" data-testid="button-add-workout">
          <Plus className="mr-2 h-4 w-4" /> Add day to week {week}
        </Button>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-4 py-3 backdrop-blur md:left-60">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <span className="font-num text-xs text-muted-foreground">Unsaved changes</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { const { source: _s, reviewCount: _r, ...rest } = program; void _s; void _r; setDraft(JSON.parse(JSON.stringify(rest)) as ProgramInput); setDirty(false); }} data-testid="button-discard">Discard</Button>
              <Button size="sm" onClick={doSave} disabled={save.isPending} data-testid="button-save-sticky">{save.isPending ? "Saving…" : "Save program"}</Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl uppercase">Assign {program.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">The athlete receives a snapshot of the saved program. Save any edits first.</p>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Athlete</Label>
              <Select value={athleteId} onValueChange={setAthleteId}>
                <SelectTrigger data-testid="select-athlete"><SelectValue placeholder="Choose athlete" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={data.profile.id}>Myself ({data.profile.name || "me"})</SelectItem>
                  {data.athletes.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-start-date" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={doAssign} disabled={!athleteId || !startDate || assign.isPending || dirty} data-testid="button-confirm-assign">
              {dirty ? "Save edits first" : assign.isPending ? "Assigning…" : "Assign block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
