import { useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Columns3, FileSpreadsheet, Plus, Trash2, Upload } from "lucide-react";
import { useSaveProgram } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errMessage, useInvalidateAll, useMutationGuard } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { importWorkbook } from "@/lib/workbook-import";
import {
  FIELDS, draftToProgram, parseSheetWithMapping, validateProgram,
  type ColumnMapping, type DraftExercise, type DraftWorkout, type Field, type SheetDraft,
} from "@/lib/workbook-parser";
import { PHASE_LABEL } from "@/lib/pl";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;
const PHASES = ["volume", "strength", "deload", "peak"] as const;
const LIFTS = ["squat", "bench", "deadlift", "accessory"] as const;
const LAYOUT_LABEL: Record<SheetDraft["layout"], string> = {
  table: "Table", blocks: "Repeated blocks", freeform: "Freeform guess", mapped: "Manual mapping", none: "Not recognised",
};

type Candidate = { draft: SheetDraft; selected: boolean; open: boolean; mapOpen: boolean; savedId?: string; error?: string };

const cell = (v: unknown) => v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
const fieldCls = "h-8 min-w-0 max-w-full rounded-sm px-2 text-xs";

function MappingPanel({ draft, onApply }: { draft: SheetDraft; onApply: (m: ColumnMapping) => void }) {
  const width = Math.min(30, Math.max(1, ...draft.data.slice(0, 60).map((r) => r.length)));
  const [headerRow, setHeaderRow] = useState(draft.mapping?.headerRow ?? 0);
  const [cols, setCols] = useState<Partial<Record<Field, number>>>(draft.mapping?.columns ?? {});
  const preview = draft.data.slice(Math.max(0, headerRow - 1), headerRow + 6);
  const colName = (c: number) => `${String.fromCharCode(65 + (c % 26))}${c >= 26 ? "+" : ""} ${cell(draft.data[headerRow]?.[c]).slice(0, 18)}`;
  return (
    <div className="mt-3 border border-[#B4975A]/50 bg-[#B4975A]/5 p-3" data-testid={`panel-mapping-${draft.sheet}`}>
      <p className="mb-3 text-xs text-muted-foreground">Tell the importer which row holds the column titles and what each column means. Rows above the header row are read only for Week / Day labels. Unmapped columns are not imported.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-widest">Header row
          <Input type="number" min={1} max={draft.data.length} value={headerRow + 1} onChange={(e) => setHeaderRow(Math.max(0, Math.min(draft.data.length - 1, (Number(e.target.value) || 1) - 1)))} className={fieldCls} data-testid="input-map-header-row" />
        </label>
        {FIELDS.map(({ field, label }) => (
          <label key={field} className="grid gap-1 text-[11px] font-semibold uppercase tracking-widest">{label}
            <select className="h-8 border bg-background px-1 text-xs normal-case tracking-normal" value={cols[field] ?? -1} onChange={(e) => { const v = Number(e.target.value); setCols((p) => { const n = { ...p }; if (v < 0) delete n[field]; else n[field] = v; return n; }); }} data-testid={`select-map-${field}`}>
              <option value={-1}>Not in this sheet</option>
              {Array.from({ length: width }, (_, c) => <option key={c} value={c}>{colName(c)}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="font-num text-[10px]">
          <tbody>{preview.map((r, i) => {
            const rowIdx = Math.max(0, headerRow - 1) + i;
            return <tr key={i} className={cn("border-t", rowIdx === headerRow && "bg-primary/10 font-semibold")}>
              <td className="pr-2 text-muted-foreground">{rowIdx + 1}</td>
              {Array.from({ length: width }, (_, c) => <td key={c} className="max-w-[120px] truncate px-1.5 py-0.5">{cell(r[c])}</td>)}
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" disabled={cols.exercise === undefined} onClick={() => onApply({ headerRow, columns: cols })} data-testid="button-apply-mapping">Re-read with this mapping</Button>
      </div>
      {cols.exercise === undefined && <p className="mt-1 text-right text-[11px] text-destructive">Choose the exercise column first.</p>}
    </div>
  );
}

function ExerciseRow({ ex, onChange, onDelete, disabled, testId }: { ex: DraftExercise; onChange: (e: DraftExercise) => void; onDelete: () => void; disabled: boolean; testId: string }) {
  const set = (p: Partial<DraftExercise>) => onChange({ ...ex, ...p });
  return (
    <div className={cn("grid gap-1.5 border-t py-2 sm:grid-cols-[minmax(0,2fr)_60px_70px_minmax(0,1.3fr)_110px_auto]", ex.review && "bg-[hsl(var(--deadlift)/0.06)]")} data-testid={testId}>
      <Input value={ex.name} onChange={(e) => set({ name: e.target.value })} placeholder="Exercise" aria-label="Exercise name" disabled={disabled} className={cn(fieldCls, !ex.name.trim() && "border-destructive")} data-testid={`${testId}-name`} />
      <Input value={ex.sets} onChange={(e) => set({ sets: e.target.value })} placeholder="Sets" aria-label="Sets" disabled={disabled} className={cn(fieldCls, "font-num")} data-testid={`${testId}-sets`} />
      <Input value={ex.reps} onChange={(e) => set({ reps: e.target.value })} placeholder="Reps" aria-label="Reps" disabled={disabled} className={cn(fieldCls, "font-num")} data-testid={`${testId}-reps`} />
      <Input value={ex.effort} onChange={(e) => set({ effort: e.target.value })} placeholder="% / RPE / effort" aria-label="Effort" disabled={disabled} className={fieldCls} data-testid={`${testId}-effort`} />
      <select value={ex.lift} onChange={(e) => set({ lift: e.target.value as DraftExercise["lift"] })} aria-label="Lift type" disabled={disabled} className="h-8 border bg-background px-1 text-xs" data-testid={`${testId}-lift`}>
        {LIFTS.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete} disabled={disabled} aria-label="Delete row" data-testid={`${testId}-delete`}><Trash2 className="h-3.5 w-3.5" /></Button>
      <Input value={ex.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Notes" aria-label="Notes" disabled={disabled} className={cn(fieldCls, "sm:col-span-4")} data-testid={`${testId}-notes`} />
      <label className="flex items-center gap-1.5 text-[11px] sm:col-span-2">
        <Checkbox checked={ex.review} disabled={disabled} onCheckedChange={(v) => set({ review: v === true })} data-testid={`${testId}-review`} /> Needs review
        <span className="ml-auto font-num text-[10px] text-muted-foreground">{ex.source}</span>
      </label>
      {ex.flags.length > 0 && <ul className="text-[11px] text-[hsl(var(--deadlift))] sm:col-span-6">{ex.flags.map((f, i) => <li key={i} className="flex gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{f}</li>)}</ul>}
    </div>
  );
}

function WorkoutEditor({ w, onChange, onDelete, disabled, testId }: { w: DraftWorkout; onChange: (w: DraftWorkout) => void; onDelete: () => void; disabled: boolean; testId: string }) {
  const n = (v: string, max: number) => Math.max(1, Math.min(max, Math.round(Number(v) || 1)));
  return (
    <div className="border bg-background/60 p-2.5" data-testid={testId}>
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[64px_64px_minmax(0,1fr)_auto]">
        <label className="grid gap-0.5 font-num text-[10px] uppercase tracking-widest text-muted-foreground">Week<Input type="number" min={1} max={52} value={w.week} disabled={disabled} onChange={(e) => onChange({ ...w, week: n(e.target.value, 52) })} className={cn(fieldCls, "font-num")} data-testid={`${testId}-week`} /></label>
        <label className="grid gap-0.5 font-num text-[10px] uppercase tracking-widest text-muted-foreground">Day<Input type="number" min={1} max={7} value={w.day} disabled={disabled} onChange={(e) => onChange({ ...w, day: n(e.target.value, 7) })} className={cn(fieldCls, "font-num")} data-testid={`${testId}-day`} /></label>
        <label className="grid gap-0.5 font-num text-[10px] uppercase tracking-widest text-muted-foreground">Workout name<Input value={w.name} disabled={disabled} onChange={(e) => onChange({ ...w, name: e.target.value })} className={cn(fieldCls, !w.name.trim() && "border-destructive")} data-testid={`${testId}-name`} /></label>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete} disabled={disabled} aria-label="Delete workout" data-testid={`${testId}-delete`}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {w.flags.length > 0 && <ul className="mt-1.5 text-[11px] text-[hsl(var(--deadlift))]">{w.flags.map((f, i) => <li key={i} className="flex gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{f}</li>)}</ul>}
      <div className="mt-2">
        {w.exercises.map((ex, k) => (
          <ExerciseRow key={ex.id} ex={ex} disabled={disabled} testId={`${testId}-ex-${k}`}
            onChange={(e) => onChange({ ...w, exercises: w.exercises.map((x) => (x.id === e.id ? e : x)) })}
            onDelete={() => onChange({ ...w, exercises: w.exercises.filter((x) => x.id !== ex.id) })} />
        ))}
        {w.exercises.length === 0 && <p className="border-t py-2 text-[11px] text-muted-foreground">No exercises left. This workout will not be saved.</p>}
        <Button variant="ghost" size="sm" className="mt-1 h-7 text-xs" disabled={disabled || w.exercises.length >= 50} onClick={() => onChange({ ...w, exercises: [...w.exercises, { id: crypto.randomUUID(), name: "", sets: "", reps: "", effort: "", weight: "", sourceUnit: "lb", setWeights: [], notes: "", review: false, lift: "accessory", flags: [], source: "Added in review" }] })} data-testid={`${testId}-add`}>
          <Plus className="mr-1 h-3 w-3" /> Add exercise
        </Button>
      </div>
    </div>
  );
}

function CandidateEditor({ c, onChange, disabled, idx }: { c: Candidate; onChange: (c: Candidate) => void; disabled: boolean; idx: number }) {
  const d = c.draft;
  const setDraft = (p: Partial<SheetDraft>) => onChange({ ...c, draft: { ...d, ...p } });
  const maxWeek = Math.max(1, ...d.workouts.map((w) => w.week));
  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_90px]">
        <label className="grid gap-0.5 font-num text-[10px] uppercase tracking-widest text-muted-foreground">Program name<Input value={d.name} maxLength={120} disabled={disabled} onChange={(e) => setDraft({ name: e.target.value })} className={cn(fieldCls, !d.name.trim() && "border-destructive")} data-testid={`input-import-name-${idx}`} /></label>
        <label className="grid gap-0.5 font-num text-[10px] uppercase tracking-widest text-muted-foreground">Phase
          <select value={d.phase} disabled={disabled} onChange={(e) => setDraft({ phase: e.target.value as SheetDraft["phase"] })} className="h-8 border bg-background px-1 text-xs" data-testid={`select-import-phase-${idx}`}>
            {PHASES.map((p) => <option key={p} value={p}>{PHASE_LABEL[p] ?? p}</option>)}
          </select>
        </label>
        <label className="grid gap-0.5 font-num text-[10px] uppercase tracking-widest text-muted-foreground">Weeks<Input type="number" min={1} max={52} value={d.weeks} disabled={disabled} onChange={(e) => setDraft({ weeks: Math.max(1, Math.min(52, Math.round(Number(e.target.value) || 1))) })} className={cn(fieldCls, "font-num", d.weeks < maxWeek && "border-destructive")} data-testid={`input-import-weeks-${idx}`} /></label>
      </div>

      {d.skipped.length > 0 && (
        <details className="border border-dashed p-2 text-xs" data-testid={`details-skipped-${idx}`}>
          <summary className="cursor-pointer font-semibold">{d.skipped.length} line{d.skipped.length === 1 ? "" : "s"} not imported. Check nothing important is here.</summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {d.skipped.map((s, i) => <li key={i} className="grid grid-cols-[52px_minmax(0,1fr)] gap-2"><span className="font-num text-muted-foreground">Row {s.row}</span><span><span className="break-words">{s.text}</span><span className="block text-[10px] text-muted-foreground">{s.reason}</span></span></li>)}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">If any of these are exercises, add them with Add exercise or use Map columns to re-read the sheet.</p>
        </details>
      )}

      <div className="space-y-2">
        {d.workouts.map((w, k) => (
          <WorkoutEditor key={w.id} w={w} disabled={disabled} testId={`workout-${idx}-${k}`}
            onChange={(nw) => setDraft({ workouts: d.workouts.map((x) => (x.id === nw.id ? nw : x)) })}
            onDelete={() => setDraft({ workouts: d.workouts.filter((x) => x.id !== w.id) })} />
        ))}
      </div>
      <Button variant="outline" size="sm" disabled={disabled || d.workouts.length >= 364} onClick={() => setDraft({ workouts: [...d.workouts, { id: crypto.randomUUID(), name: "New workout", week: 1, day: 1, flags: [], exercises: [] }] })} data-testid={`button-add-workout-${idx}`}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add workout
      </Button>
    </div>
  );
}

export function WorkbookImport({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const save = useSaveProgram();
  const invalidate = useInvalidateAll();
  const guard = useMutationGuard();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [items, setItems] = useState<Candidate[]>([]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFileName(""); setParseError(""); setWarnings([]); setItems([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { setParseError("Only .xlsx workbooks are supported."); return; }
    if (file.size > MAX_BYTES) { setParseError("File is larger than the 10 MB limit."); return; }
    setFileName(file.name);
    setParsing(true);
    try {
      const r = await importWorkbook(file);
      setWarnings(r.warnings.filter((w) => !r.drafts.some((d) => w.startsWith(`${d.sheet}: `))));
      setItems(r.drafts.map((d, i) => ({ draft: d, selected: d.workouts.length > 0, open: i === 0 || d.layout === "none", mapOpen: d.layout === "none" })));
    } catch (e) {
      setParseError(errMessage(e));
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = ""; // never keep the raw file around
    }
  };

  const update = (i: number, c: Candidate) => setItems((prev) => prev.map((x, j) => (j === i ? c : x)));
  const programs = items.map((c) => draftToProgram(c.draft));
  const errors = programs.map((p) => validateProgram(p));
  const pending = items.map((c, i) => ({ c, i })).filter(({ c }) => c.selected && !c.savedId);
  const blocked = pending.filter(({ i }) => errors[i].length).length;
  const savedCount = items.filter((c) => c.savedId).length;

  const runSave = async () => {
    if (!guard() || !pending.length || blocked) return;
    setSaving(true);
    let ok = 0, failed = 0;
    for (const { i } of pending) {
      try {
        const saved = await save.mutateAsync({ data: { ...programs[i], id: undefined, archived: false } });
        ok++;
        setItems((prev) => prev.map((x, j) => (j === i ? { ...x, savedId: saved.id, error: undefined } : x)));
      } catch (e) {
        failed++;
        setItems((prev) => prev.map((x, j) => (j === i ? { ...x, error: errMessage(e) } : x)));
      }
    }
    setSaving(false);
    await invalidate();
    if (failed) toast({ title: `${ok} saved, ${failed} failed`, description: "Retry saves only the programs that failed.", variant: "destructive" });
    else toast({ title: `${ok} program${ok === 1 ? "" : "s"} imported` });
  };

  const close = (o: boolean) => {
    if (saving) return;
    if (!o) reset();
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="workbook-review min-w-0 max-h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl grid-cols-[minmax(0,1fr)] overflow-y-auto p-4 sm:p-6 [&_*]:min-w-0 [&_select]:max-w-full [&_input]:max-w-full [&_li]:break-words">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">Import workbook</DialogTitle>
          <DialogDescription>
            Excel .xlsx only, up to 10 MB, read in your browser and never stored. Each sheet becomes a candidate program. The importer recognises common column names in any order, stacked or side-by-side weeks, weekday and session labels, combined sets x reps, percentages and RPE. Layout detection is a best guess, not a guarantee: every guess is flagged below and nothing is saved until you review it. Only prescriptions are imported; recorded weights and completed sessions never are.
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-center gap-3 border border-dashed p-4 hover:border-[#B4975A]" data-testid="label-workbook-file">
          <FileSpreadsheet className="h-6 w-6 text-[#B4975A]" />
          <span className="min-w-0 flex-1 truncate text-sm">{parsing ? "Reading workbook…" : fileName || "Choose a workbook"}</span>
          <span className="inline-flex items-center gap-1 font-num text-xs uppercase tracking-widest"><Upload className="h-3.5 w-3.5" /> Browse</span>
          <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={parsing || saving} onChange={(e) => void onFile(e.target.files?.[0])} data-testid="input-workbook-file" />
        </label>

        {parsing && <div className="space-y-2" data-testid="import-loading">{[0, 1].map((i) => <div key={i} className="h-14 animate-pulse bg-muted" />)}</div>}
        {parseError && <p role="alert" className="whitespace-pre-line text-sm text-destructive" data-testid="text-import-error">{parseError}</p>}

        {warnings.length > 0 && (
          <div className="border border-[hsl(var(--deadlift))] bg-[hsl(var(--deadlift)/0.1)] p-3 text-xs" data-testid="list-import-warnings">
            <div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Workbook notes</div>
            <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}

        {items.length > 0 && (
          <ul className="divide-y border-y" data-testid="list-import-candidates">
            {items.map((c, i) => {
              const d = c.draft;
              const exercises = d.workouts.reduce((n, w) => n + w.exercises.length, 0);
              const review = d.workouts.reduce((n, w) => n + w.exercises.filter((e) => e.review).length, 0);
              const locked = !!c.savedId || saving;
              return (
                <li key={d.sheet + i} className="py-3" data-testid={`row-import-${i}`}>
                  <div className="flex items-start gap-3">
                    <Checkbox checked={c.selected} disabled={locked || !d.workouts.length} onCheckedChange={(v) => update(i, { ...c, selected: v === true })} className="mt-1" aria-label={`Include ${d.name}`} data-testid={`checkbox-import-${i}`} />
                    <div className="min-w-0 flex-1">
                      <button className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => update(i, { ...c, open: !c.open })} data-testid={`button-toggle-import-${i}`}>
                        {c.open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span className="font-display text-lg font-bold uppercase">{d.name || d.sheet}</span>
                        <span className="border px-1.5 py-0.5 font-num text-[10px] uppercase tracking-widest">{PHASE_LABEL[d.phase] ?? d.phase}</span>
                        <span className={cn("px-1.5 py-0.5 font-num text-[10px] uppercase tracking-widest", d.layout === "table" || d.layout === "blocks" ? "bg-secondary" : "border border-dashed border-[hsl(var(--deadlift))] text-[hsl(var(--deadlift))]")}>{LAYOUT_LABEL[d.layout]}</span>
                        {c.savedId && <span className="inline-flex items-center gap-1 font-num text-[10px] uppercase tracking-widest text-[hsl(var(--accessory))]"><Check className="h-3 w-3" /> Saved</span>}
                      </button>
                      <p className="font-num text-[11px] text-muted-foreground">Sheet "{d.sheet}" · {d.weeks} wks · {d.workouts.length} workouts · {exercises} exercises{review ? ` · ${review} to review` : ""}{d.skipped.length ? ` · ${d.skipped.length} lines not imported` : ""}</p>
                      {d.warnings.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-[11px] text-[hsl(var(--deadlift))]" data-testid={`list-sheet-warnings-${i}`}>
                          {d.warnings.map((w, k) => <li key={k} className="flex gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</li>)}
                        </ul>
                      )}
                      {c.selected && !c.savedId && errors[i].length > 0 && (
                        <ul className="mt-1.5 list-disc pl-4 text-[11px] text-destructive" data-testid={`list-import-errors-${i}`}>
                          {errors[i].slice(0, 6).map((e, k) => <li key={k}>{e}</li>)}
                          {errors[i].length > 6 && <li>{errors[i].length - 6} more</li>}
                        </ul>
                      )}
                      {c.error && <p className="mt-1 text-xs text-destructive">{c.error}</p>}
                      {!c.savedId && (
                        <Button variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs" disabled={saving} onClick={() => update(i, { ...c, mapOpen: !c.mapOpen })} data-testid={`button-map-columns-${i}`}>
                          <Columns3 className="mr-1 h-3.5 w-3.5" /> {c.mapOpen ? "Hide column mapping" : "Map columns"}
                        </Button>
                      )}
                      {c.mapOpen && !c.savedId && (
                        <MappingPanel draft={d} onApply={(m) => {
                          const next = parseSheetWithMapping(d.sheet, d.data, m);
                          update(i, { ...c, draft: { ...next, name: d.name, phase: d.phase }, selected: next.workouts.length > 0, open: true, mapOpen: false });
                          toast({ title: `Re-read ${d.sheet}`, description: `${next.workouts.length} workouts found. Review before saving.` });
                        }} />
                      )}
                      {c.open && <CandidateEditor c={c} idx={i} disabled={locked} onChange={(nc) => update(i, nc)} />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter className="gap-2">
          {blocked > 0 && <span className="self-center text-xs text-destructive" data-testid="text-import-blocked">Fix {blocked} program{blocked === 1 ? "" : "s"} with errors or untick {blocked === 1 ? "it" : "them"}.</span>}
          <Button variant="outline" onClick={() => close(false)} disabled={saving} data-testid="button-import-close">{savedCount ? "Done" : "Cancel"}</Button>
          <Button onClick={() => void runSave()} disabled={saving || parsing || !pending.length || blocked > 0} data-testid="button-import-save">
            {saving ? "Saving…" : items.some((c) => c.error && !c.savedId) ? `Retry ${pending.length}` : `Save ${pending.length} reviewed program${pending.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
