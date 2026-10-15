import { useRef, useState } from "react";
import { AlertTriangle, Check, FileSpreadsheet, Upload } from "lucide-react";
import { useSaveProgram, type ProgramInput } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errMessage, useInvalidateAll, useMutationGuard } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { importWorkbook } from "@/lib/workbook-import";
import { PHASE_LABEL } from "@/lib/pl";

const MAX_BYTES = 10 * 1024 * 1024;

type Candidate = { program: ProgramInput; selected: boolean; savedId?: string; error?: string };

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
      setWarnings(r.warnings);
      setItems(r.programs.map((p) => ({ program: { ...p, id: undefined }, selected: true })));
      if (!r.programs.length) setParseError("No programs were found in this workbook.");
    } catch (e) {
      setParseError(errMessage(e));
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = ""; // never keep the raw file around
    }
  };

  const pending = items.filter((c) => c.selected && !c.savedId);
  const savedCount = items.filter((c) => c.savedId).length;

  const runSave = async () => {
    if (!guard() || !pending.length) return;
    setSaving(true);
    let ok = 0, failed = 0;
    for (let i = 0; i < items.length; i++) {
      const c = items[i];
      if (!c.selected || c.savedId) continue; // skip already-saved to avoid duplicates on retry
      try {
        const saved = await save.mutateAsync({ data: { ...c.program, id: undefined, archived: false } });
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
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">Import workbook</DialogTitle>
          <DialogDescription>
            Excel .xlsx only, up to 10 MB. Each sheet becomes a candidate program, read from the team block layout or a simple table of rows. Imports are program templates only, never logged sessions. The file is read in your browser and is not stored.
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-center gap-3 border border-dashed p-4 hover:border-[#B4975A]" data-testid="label-workbook-file">
          <FileSpreadsheet className="h-6 w-6 text-[#B4975A]" />
          <span className="min-w-0 flex-1 text-sm">{parsing ? "Reading workbook…" : fileName || "Choose a workbook"}</span>
          <span className="inline-flex items-center gap-1 font-num text-xs uppercase tracking-widest"><Upload className="h-3.5 w-3.5" /> Browse</span>
          <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={parsing || saving} onChange={(e) => void onFile(e.target.files?.[0])} data-testid="input-workbook-file" />
        </label>

        {parseError && <p role="alert" className="text-sm text-destructive" data-testid="text-import-error">{parseError}</p>}

        {warnings.length > 0 && (
          <div className="border border-[hsl(var(--deadlift))] bg-[hsl(var(--deadlift)/0.1)] p-3 text-xs" data-testid="list-import-warnings">
            <div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> {warnings.length} warning{warnings.length === 1 ? "" : "s"}</div>
            <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}

        {items.length > 0 && (
          <ul className="divide-y border-y" data-testid="list-import-candidates">
            {items.map((c, i) => {
              const exercises = c.program.workouts.reduce((n, w) => n + w.exercises.length, 0);
              const review = c.program.workouts.reduce((n, w) => n + w.exercises.filter((e) => e.review).length, 0);
              return (
                <li key={i} className="flex items-start gap-3 py-3" data-testid={`row-import-${i}`}>
                  <Checkbox checked={c.selected} disabled={!!c.savedId || saving} onCheckedChange={(v) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, selected: v === true } : x)))} className="mt-1" data-testid={`checkbox-import-${i}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg font-bold uppercase">{c.program.name}</span>
                      <span className="border px-1.5 py-0.5 font-num text-[10px] uppercase tracking-widest">{PHASE_LABEL[c.program.phase] ?? c.program.phase}</span>
                      {c.savedId && <span className="inline-flex items-center gap-1 font-num text-[10px] uppercase tracking-widest text-[hsl(var(--accessory))]"><Check className="h-3 w-3" /> Saved</span>}
                    </div>
                    <p className="font-num text-[11px] text-muted-foreground">{c.program.weeks} wks · {c.program.workouts.length} workouts · {exercises} exercises{review ? ` · ${review} to review` : ""}</p>
                    {c.error && <p className="mt-1 text-xs text-destructive">{c.error}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => close(false)} disabled={saving} data-testid="button-import-close">{savedCount ? "Done" : "Cancel"}</Button>
          <Button onClick={() => void runSave()} disabled={saving || parsing || !pending.length} data-testid="button-import-save">
            {saving ? "Saving…" : items.some((c) => c.error && !c.savedId) ? `Retry ${pending.length}` : `Save ${pending.length} program${pending.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
