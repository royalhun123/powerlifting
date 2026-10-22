import { useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import { useUpdateProfile, type ProfileInput } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, LoadingPage, PageHeader, Panel, SignInCallout } from "@/components/common";
import { errMessage, useInvalidateAll, useMutationGuard, useWorkspace } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { convertLoad, daysUntil, fmtNum, LIFT_VAR } from "@/lib/pl";
import { cn } from "@/lib/utils";
import { Building2, History } from "lucide-react";
import { WorkspaceBadge, useWorkspaceScope } from "@/components/workspace-badge";
import { TrueMaxButton, TrueMaxHistory } from "@/components/true-max-tracking";
import { LatestBodyweight } from "@/components/bodyweight-tracking";
import { PasswordAccountsPanel, OwnPasswordAccount } from "@/components/password-accounts-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OfflineHelp } from "@/components/offline-help";

export default function Settings() {
  const { data, isLoading, isError, error, refetch } = useWorkspace();
  const update = useUpdateProfile();
  const invalidate = useInvalidateAll();
  const guard = useMutationGuard();
  const { toast } = useToast();
  const scope = useWorkspaceScope();
  const [form, setForm] = useState<ProfileInput | null>(null);
  const init = useRef<string | null>(null);

  useEffect(() => {
    if (data && init.current !== data.profile.id) {
      init.current = data.profile.id;
      const { name, unit, meetDate, squatMax, benchMax, deadliftMax } = data.profile;
      setForm({ name, unit, meetDate, squatMax, benchMax, deadliftMax });
    }
  }, [data]);

  if (isLoading || (data && !form)) return <LoadingPage />;
  if (isError || !data || !form) return <ErrorState message={errMessage(error)} onRetry={() => refetch()} />;

  const adminOnly = !!data.isAdmin && !(data.isLifter ?? false);
  const set = (p: Partial<ProfileInput>) => setForm({ ...form, ...p });
  const num = (v: string) => Math.max(0, Math.min(2000, Number(v) || 0));
  const valid = form.name.trim().length > 0;
  const meet = form.meetDate ? daysUntil(form.meetDate) : null;

  const submit = () => {
    if (!guard() || !valid) return;
    update.mutate(
      { data: { ...form, name: form.name.trim() } },
      {
        onSuccess: async () => {
          await invalidate();
          toast({ title: "Settings saved" });
        },
        onError: (e) => toast({ title: "Save failed", description: errMessage(e), variant: "destructive" }),
      },
    );
  };

  return (
    <div className="max-w-3xl">
      <PageHeader kicker="Profile" title="Settings">
        <Button onClick={submit} disabled={update.isPending || !valid} data-testid="button-save-settings">
          <Save className="mr-2 h-4 w-4" /> {update.isPending ? "Saving…" : "Save"}
        </Button>
      </PageHeader>
      <Tabs defaultValue="profile">
        <TabsList className="mb-4">
          <TabsTrigger value="profile">Profile & account</TabsTrigger>
          <TabsTrigger value="offline">Install & offline help</TabsTrigger>
        </TabsList>
        <TabsContent value="offline"><OfflineHelp /></TabsContent>
        <TabsContent value="profile">
      {data.demo && <div className="mb-5"><SignInCallout text="Demo profile shown. Sign in to set your own maxes and meet date." /></div>}
      {!data.demo && form.squatMax + form.benchMax + form.deadliftMax === 0 && <div className="mb-5 rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">Enter your reference maxes so percentage work (e.g. 85%) turns into real target loads.</div>}
      <div className="space-y-5">
        <Panel title={<span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4 text-[#B4975A]" /> Workspace</span>}>
          <div data-testid="section-workspace"><WorkspaceBadge /></div>
          <p className="mt-2 text-sm text-muted-foreground">{scope.isTeam ? `You are signed in to the ${scope.name} team workspace. Lifters, groups and programs you see here belong only to this workspace.` : "You are signed in to a personal workspace. Your groups and program library are private to this workspace."} Each workspace has its own username login; sign out and sign in with the other account to reach a different one.</p>
        </Panel>
        <LatestBodyweight unit={form.unit} />
        <OwnPasswordAccount />
        <PasswordAccountsPanel />
        <Panel title="Lifter">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input value={form.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} data-testid="input-name" />
              {!valid && <span className="text-xs text-destructive">Name is required</span>}
            </div>
            <div className="grid gap-1.5">
              <Label>Preferred unit</Label>
              <div className="inline-flex w-fit rounded-md border p-0.5">
                {(["lb", "kg"] as const).map((u) => (
                  <button key={u} onClick={() => u !== form.unit && set({ unit: u, squatMax: convertLoad(form.squatMax, form.unit, u), benchMax: convertLoad(form.benchMax, form.unit, u), deadliftMax: convertLoad(form.deadliftMax, form.unit, u) })} className={cn("rounded-sm px-5 py-1.5 font-num text-sm", form.unit === u ? "bg-foreground text-background" : "text-muted-foreground")} data-testid={`button-unit-${u}`}>{u}</button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">Switching converts your reference maxes (1 kg = 2.20462 lb, rounded to plate increments). Analytics display in this unit.</span>
            </div>
          </div>
        </Panel>
        <Panel title="Meet">
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-1.5">
              <Label>Meet date</Label>
              <Input type="date" value={form.meetDate} onChange={(e) => set({ meetDate: e.target.value })} className="w-48" data-testid="input-meet-date" />
            </div>
            {form.meetDate && <Button variant="ghost" size="sm" onClick={() => set({ meetDate: "" })} data-testid="button-clear-meet">Clear</Button>}
            {meet !== null && <span className="font-num text-sm text-muted-foreground">{meet >= 0 ? `${meet} days out` : `${-meet} days ago`}</span>}
          </div>
        </Panel>
        <Panel title={`Reference maxes (${form.unit})`}>
          <p className="mb-4 text-sm text-muted-foreground">Percentage prescriptions such as 85% are calculated from these and rounded to the nearest {form.unit === "kg" ? "2.5 kg" : "5 lb"}.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {([["squatMax", "squat"], ["benchMax", "bench"], ["deadliftMax", "deadlift"]] as const).map(([k, l]) => (
              <div key={k} className="relative rounded-md border p-3 pl-4">
                <span className="absolute inset-y-0 left-0 w-1 rounded-l-md" style={{ background: LIFT_VAR[l] }} />
                <Label className="font-num text-[10px] uppercase tracking-widest">{l}</Label>
                <Input type="number" inputMode="decimal" min={0} max={2000} step={form.unit === "kg" ? 2.5 : 5} value={form[k]} onChange={(e) => set({ [k]: num(e.target.value) } as Partial<ProfileInput>)} className="mt-1 h-12 font-display text-2xl font-bold" data-testid={`input-${k}`} />
              </div>
            ))}
          </div>
          <div className="mt-3 text-right font-num text-sm">Total <b>{fmtNum(form.squatMax + form.benchMax + form.deadliftMax, 1)}</b> {form.unit}</div>
        </Panel>
        {!data.demo && !adminOnly && (
          <section className="rounded-md border border-dashed border-primary/40 bg-card p-5" data-testid="section-prior-lifting-history">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-xl">
                <div className="flex items-center gap-2 font-num text-[10px] uppercase tracking-[0.22em] text-primary"><History className="h-3.5 w-3.5" /> Backfill</div>
                <h2 className="font-display text-2xl font-bold uppercase leading-tight">Prior lifting history</h2>
                <p className="mt-1 text-sm text-muted-foreground">Add tested true 1RMs from before you joined the team, with the date each was hit. They fill in your 1RM trend so progress starts from where you really were, not from day one here. Only enter maxes you actually completed; estimates belong nowhere near this list. Entries do not change workout volume or the reference maxes above.</p>
              </div>
              <TrueMaxButton />
            </div>
            <TrueMaxHistory days={0} />
          </section>
        )}
      </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
