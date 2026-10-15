import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, Archive, Copy, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { WorkbookImport } from "@/components/workbook-import";
import { useDeleteProgram, useSaveProgram, type Program, type ProgramInputPhase } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingPage, PageHeader } from "@/components/common";
import { errMessage, useInvalidateAll, useMutationGuard, useWorkspace } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { PHASE_LABEL } from "@/lib/pl";
import { cn } from "@/lib/utils";

const PHASE_COLOR: Record<string, string> = {
  volume: "hsl(var(--bench))",
  strength: "hsl(var(--squat))",
  deload: "hsl(var(--accessory))",
  peak: "hsl(var(--deadlift))",
};

export function PhaseBadge({ phase }: { phase: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-num text-[10px] uppercase tracking-widest">
      <span className="h-2 w-2 rounded-full" style={{ background: PHASE_COLOR[phase] }} />
      {PHASE_LABEL[phase] ?? phase}
    </span>
  );
}

/** Fail closed; the server supplies ownership even for legacy programs. */
export function isProgramOwner(p: Program, profileId: string) {
  return p.uploaderId === profileId;
}

export function UploaderTag({ p, profileId }: { p: Program; profileId: string }) {
  const mine = isProgramOwner(p, profileId);
  return (
    <span className={cn("inline-flex items-center border px-1.5 py-0.5 font-num text-[10px] uppercase tracking-widest", mine ? "border-[#B4975A]/60 text-accent-foreground" : "text-muted-foreground")} data-testid={`text-uploader-${p.id}`}>
      {mine ? "Yours" : `By ${p.uploaderName || "another coach"}`}
    </span>
  );
}

export default function Programs() {
  const { data, isLoading, isError, error, refetch } = useWorkspace();
  const save = useSaveProgram();
  const del = useDeleteProgram();
  const invalidate = useInvalidateAll();
  const guard = useMutationGuard();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<ProgramInputPhase>("volume");
  const [weeks, setWeeks] = useState("4");
  const [toDelete, setToDelete] = useState<Program | null>(null);
  const [importing, setImporting] = useState(false);
  const [scope, setScope] = useState<"all" | "mine" | "others">("all");

  // Pick up library changes from other coaches more often than the workspace default.
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void refetch(); }, 20_000);
    return () => window.clearInterval(t);
  }, [refetch]);

  if (isLoading) return <LoadingPage />;
  if (isError || !data) return <ErrorState message={errMessage(error)} onRetry={() => refetch()} />;

  const pid = data.profile.id;
  const programs = data.programs.filter((p) => (showArchived || !p.archived) && (scope === "all" || (scope === "mine") === isProgramOwner(p, pid)));
  const archivedCount = data.programs.filter((p) => p.archived).length;

  const create = () => {
    if (!guard()) return;
    save.mutate(
      { data: { name: name.trim() || "Untitled block", description: "", phase, weeks: Math.max(1, Math.min(52, Number(weeks) || 1)), archived: false, workouts: [] } },
      {
        onSuccess: async (p) => {
          await invalidate();
          setCreating(false);
          setName("");
          setLocation(`/programs/${p.id}`);
        },
        onError: (e) => toast({ title: "Could not create", description: errMessage(e), variant: "destructive" }),
      },
    );
  };

  const duplicate = (p: Program) => {
    if (!guard()) return;
    const { id: _id, source: _s, reviewCount: _r, uploaderId: _u, uploaderName: _n, ...rest } = p;
    void _id; void _s; void _r; void _u; void _n;
    save.mutate(
      { data: { ...rest, name: `${p.name} (copy)`.slice(0, 120), archived: false } },
      {
        onSuccess: async (np) => {
          await invalidate();
          toast({ title: "Copy created", description: `${np.name} is now yours to edit.` });
        },
        onError: (e) => toast({ title: "Could not duplicate", description: errMessage(e), variant: "destructive" }),
      },
    );
  };

  const confirmDelete = () => {
    if (!toDelete || !guard()) return;
    del.mutate(
      { id: toDelete.id },
      {
        onSuccess: async () => {
          await invalidate();
          toast({ title: "Program deleted" });
          setToDelete(null);
        },
        onError: (e) => toast({ title: "Could not delete", description: errMessage(e), variant: "destructive" }),
      },
    );
  };

  return (
    <div>
      <PageHeader kicker="Shared coach library · Every coach can view, copy and assign" title="My programs">
        {archivedCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowArchived(!showArchived)} data-testid="button-toggle-archived">
            <Archive className="mr-2 h-4 w-4" /> {showArchived ? "Hide" : "Show"} archived ({archivedCount})
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => (guard() ? setImporting(true) : undefined)} data-testid="button-import-workbook">
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Import .xlsx
        </Button>
        <Button size="sm" onClick={() => (guard() ? setCreating(true) : undefined)} data-testid="button-new-program">
          <Plus className="mr-2 h-4 w-4" /> New block
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-1" role="tablist">
        {([["all", "All coaches"], ["mine", "Uploaded by me"], ["others", "Other coaches"]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={scope === k ? "default" : "outline"} onClick={() => setScope(k)} data-testid={`button-scope-${k}`}>{l}</Button>
        ))}
        <span className="ml-auto font-num text-[11px] text-muted-foreground">Your own assigned training lives in <Link href="/my-training" className="text-primary underline" data-testid="link-my-training">My training</Link>.</span>
      </div>

      {programs.length === 0 ? (
        <EmptyState title="No programs" body="Create a block, or sign in to see your imported blocks." />
      ) : (
        <div className="grid gap-3">
          {programs.map((p, i) => {
            const days = p.workouts.length;
            const weeks = new Set(p.workouts.map((w) => w.week)).size;
            const owner = isProgramOwner(p, pid);
            return (
              <div key={p.id} className={cn("rise group relative grid gap-4 rounded-md border border-card-border bg-card p-4 md:grid-cols-[auto_1fr_auto] md:items-center", p.archived && "opacity-60")} style={{ animationDelay: `${i * 40}ms` }} data-testid={`card-program-${p.id}`}>
                <div className="hidden h-14 w-14 flex-col items-center justify-center rounded-sm bg-sidebar text-sidebar-foreground md:flex">
                  <span className="font-display text-2xl font-bold leading-none">{p.weeks}</span>
                  <span className="font-num text-[9px] uppercase tracking-widest opacity-60">wks</span>
                </div>
                <Link href={`/programs/${p.id}`} className="min-w-0" data-testid={`link-program-${p.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-2xl font-bold uppercase group-hover:text-primary">{p.name}</span>
                    <PhaseBadge phase={p.phase} />
                    <UploaderTag p={p} profileId={pid} />
                    {p.archived && <span className="font-num text-[10px] uppercase tracking-widest text-muted-foreground">archived</span>}
                    {p.reviewCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-[hsl(var(--deadlift)/0.18)] px-1.5 py-0.5 font-num text-[10px] uppercase tracking-widest text-foreground" data-testid={`badge-review-${p.id}`}>
                        <AlertTriangle className="h-3 w-3" /> {p.reviewCount} to review
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{p.description || "No description"}</p>
                  <div className="mt-1 font-num text-[11px] text-muted-foreground">
                    {days} workouts across {weeks} weeks · {p.workouts.reduce((n, w) => n + w.exercises.length, 0)} exercises · source: {p.source || "manual"}{p.uploaderName ? ` · uploaded by ${p.uploaderName}` : ""}
                    <div>{data.assignments.filter(a=>a.program.id===p.id && a.athleteId!==data.profile.id && !a.archived).length} active client assignments · {data.assignments.filter(a=>a.program.id===p.id && a.athleteId!==data.profile.id && a.archived).length} archived</div>
                  </div>
                </Link>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => duplicate(p)} disabled={save.isPending} data-testid={`button-duplicate-${p.id}`}>
                    <Copy className="mr-1.5 h-4 w-4" /> {owner ? "Duplicate" : "Copy to mine"}
                  </Button>
                  {owner && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => (guard() ? setToDelete(p) : undefined)} data-testid={`button-delete-${p.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl uppercase">New block</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Block 3 — Intensification" data-testid="input-program-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Phase</Label>
                <Select value={phase} onValueChange={(v) => setPhase(v as ProgramInputPhase)}>
                  <SelectTrigger data-testid="select-phase"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PHASE_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Weeks</Label>
                <Input type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(e.target.value)} data-testid="input-weeks" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={create} disabled={save.isPending} data-testid="button-create-program">{save.isPending ? "Creating…" : "Create and edit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WorkbookImport open={importing} onOpenChange={setImporting} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The program template is removed. Existing assignments keep their snapshot.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
