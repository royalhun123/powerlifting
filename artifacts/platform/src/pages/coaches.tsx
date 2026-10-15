import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateCoach, useListCoaches, getListCoachesQueryKey, type CoachDirectoryEntry } from "@workspace/api-client-react";
import { ChevronDown, Clock, Copy, Crown, EyeOff, RefreshCw, ShieldCheck, UserPlus, Users } from "lucide-react";
import { WorkspaceBadge, useWorkspaceScope } from "@/components/workspace-badge";
import { CoachDetail } from "@/components/program-inspector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, PageHeader, Panel } from "@/components/common";
import { errMessage, useMutationGuard } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

type Fresh = { url: string; expiresAt: string; renewed?: string };

export default function Coaches() {
  const qc = useQueryClient();
  const guard = useMutationGuard();
  const { toast } = useToast();
  const list = useListCoaches({ query: { queryKey: getListCoachesQueryKey(), staleTime: 15_000, refetchInterval: 30_000 } });
  const create = useCreateCoach();
  const scope = useWorkspaceScope();
  const [fresh, setFresh] = useState<Fresh | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"groups" | "independent" | "all">("groups");
  const [openId, setOpenId] = useState<string | null>(null);

  const canCreate = !create.isPending;

  const onLink = async (r: { path: string; expiresAt: string }, renewed?: string) => {
    setFresh({ url: window.location.origin + r.path, expiresAt: r.expiresAt, renewed });
    await qc.invalidateQueries({ queryKey: getListCoachesQueryKey() });
    toast({ title: "Invitation link created. Copy it now." });
  };

  const submit = () => {
    if (!guard() || !canCreate) return;
    create.mutate({ data: {} }, {
      onSuccess: (r) => onLink(r),
      onError: (e) => toast({ title: "Could not create invitation", description: errMessage(e), variant: "destructive" }),
    });
  };

  const renew = (c: CoachDirectoryEntry) => {
    if (!guard() || c.passwordEnabled) return;
    if (!window.confirm(`Create a new invitation for ${c.name || "this lifter"}? Any earlier invitation link stops working immediately.`)) return;
    setRenewingId(c.userId);
    create.mutate({ data: { userId: c.userId } }, {
      onSuccess: (r) => onLink(r, c.name),
      onError: (e) => toast({ title: "Could not renew invitation", description: errMessage(e), variant: "destructive" }),
      onSettled: () => setRenewingId(null),
    });
  };

  const lifters = (list.data ?? []).slice().sort((a, b) => Number(!!b.isGroupLeader) - Number(!!a.isGroupLeader) || a.name.localeCompare(b.name));
  const groupMap = new Map<string, { id: string; name: string; members: CoachDirectoryEntry[] }>();
  for (const l of lifters) if (l.groupId) {
    const g = groupMap.get(l.groupId) ?? { id: l.groupId, name: l.groupName || "Lifting group", members: [] };
    g.members.push(l); groupMap.set(l.groupId, g);
  }
  const groups = [...groupMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const independent = lifters.filter((l) => !l.groupId);

  const renderList = (rows: CoachDirectoryEntry[]) => (
    <ul className="divide-y border-y">
      {rows.map((c) => (
        <li key={c.userId} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start" data-testid={`row-coach-${c.userId}`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-xl font-bold uppercase">{c.name || "Invited lifter"}</span>
              <span className="font-num text-xs text-muted-foreground">{c.username || "Username chosen on setup"}</span>
              {c.isGroupLeader && <span className="inline-flex items-center gap-1 border border-[#B4975A]/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"><Crown className="h-3 w-3 text-[#B4975A]" /> Group leader</span>}
              {c.passwordEnabled ? (
                <span className="inline-flex items-center gap-1 border border-[hsl(var(--accessory))]/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--accessory))]"><ShieldCheck className="h-3 w-3" /> Active</span>
              ) : (
                <span className="inline-flex items-center gap-1 border border-[#B4975A]/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-foreground"><Clock className="h-3 w-3" /> Invited</span>
              )}
            </div>
            <p className="mt-0.5 font-num text-[11px] text-muted-foreground">Added {fmtWhen(c.createdAt)}{c.isGroupLeader ? ` · leads ${c.clients.length} lifter${c.clients.length === 1 ? "" : "s"}` : ""}</p>
            {openId === c.userId && <CoachDetail c={c} />}
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Button variant="ghost" size="sm" aria-expanded={openId === c.userId} onClick={() => setOpenId(openId === c.userId ? null : c.userId)} data-testid={`button-inspect-coach-${c.userId}`}>
              <ChevronDown className={`mr-1.5 h-3.5 w-3.5 transition-transform ${openId === c.userId ? "rotate-180" : ""}`} /> {openId === c.userId ? "Hide details" : "View details"}
            </Button>
            {!c.passwordEnabled && (
              <Button variant="outline" size="sm" disabled={create.isPending} onClick={() => renew(c)} data-testid={`button-renew-coach-${c.userId}`}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> {renewingId === c.userId ? "Renewing…" : "Renew invitation"}
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <PageHeader kicker="Admin · This workspace only" title="Lifters & groups"><WorkspaceBadge /></PageHeader>

      <div className="mb-6">
        <Panel title={<span className="inline-flex items-center gap-2"><UserPlus className="h-4 w-4 text-[#B4975A]" /> Invite an independent lifter</span>}>
          <p className="mb-4 text-sm text-muted-foreground">
            Lifters you invite join {scope.name} as independent lifters with full access to the program library. They can later create or join a lifting group. Create a one-time invitation link and send it privately; the lifter chooses their own name, username and password. Links last 24 hours and work once.
          </p>
          <Button onClick={submit} disabled={!canCreate} data-testid="button-create-coach">
            <UserPlus className="mr-1.5 h-4 w-4" /> {create.isPending && !renewingId ? "Creating…" : "Create lifter invitation link"}
          </Button>

          {fresh && (
            <div className="rise mt-4 space-y-2 border border-[#B4975A]/60 bg-[#B4975A]/5 p-3" data-testid="panel-fresh-coach-link">
              <p className="text-sm font-medium">Shown only now. Send this privately{fresh.renewed ? <> to {fresh.renewed}</> : null}. One use, expires {fmtWhen(fresh.expiresAt)}.</p>
              <Input readOnly value={fresh.url} aria-label="New one-time lifter invitation link" className="font-num text-xs" onFocus={(e) => e.currentTarget.select()} data-testid="input-fresh-coach-link" />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" data-testid="button-copy-coach-link" onClick={async () => { try { await navigator.clipboard.writeText(fresh.url); toast({ title: "Invitation link copied" }); } catch { toast({ title: "Select and copy the link above", variant: "destructive" }); } }}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
                </Button>
                <Button variant="ghost" size="sm" data-testid="button-hide-coach-link" onClick={() => { setFresh(null); create.reset(); }}>
                  <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Hide link
                </Button>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {list.isLoading ? (
        <div className="space-y-2" data-testid="coaches-loading">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse bg-muted" />)}</div>
      ) : list.isError ? (
        <ErrorState message={errMessage(list.error)} onRetry={() => list.refetch()} />
      ) : lifters.length === 0 ? (
        <EmptyState title="No lifters yet" body="Create the first invitation link above." />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-1 border-b" role="tablist" aria-label="Lifter directory">
            {([["groups", "Groups", lifters.length - independent.length], ["independent", "Independent lifters", independent.length], ["all", "All lifters", lifters.length]] as const).map(([k, l, n]) => (
              <button key={k} role="tab" id={`tab-dir-${k}`} aria-selected={tab === k} aria-controls="panel-directory" onClick={() => { setTab(k); setOpenId(null); }} className={`relative shrink-0 px-4 py-2 font-display text-lg uppercase tracking-wide ${tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`} data-testid={`tab-directory-${k}`}>
                {l} <span className="font-num text-xs">({n})</span>
                {tab === k && <span className="absolute inset-x-2 -bottom-px h-[3px] bg-primary" />}
              </button>
            ))}
          </div>
          <div id="panel-directory" role="tabpanel" aria-labelledby={`tab-dir-${tab}`} className="space-y-6">
          {tab === "groups" && groups.length === 0 && <EmptyState title="No groups yet" body="No lifter in this workspace leads or belongs to a group." />}
          {tab === "groups" && groups.map((g) => (
            <Panel key={g.id} title={<span className="inline-flex items-center gap-2"><Users className="h-4 w-4 text-[#B4975A]" /> {g.name}</span>} action={<span className="font-num text-xs text-muted-foreground" data-testid={`text-group-count-${g.id}`}>{g.members.length} lifter{g.members.length === 1 ? "" : "s"}</span>}>
              {renderList(g.members)}
            </Panel>
          ))}
          {tab === "independent" && <Panel title="Independent lifters" action={<span className="font-num text-xs text-muted-foreground" data-testid="text-coach-count">{independent.length} of {lifters.length} lifters</span>}>
            {independent.length === 0 ? <p className="text-sm text-muted-foreground">Every lifter belongs to a group.</p> : renderList(independent)}
          </Panel>}
          {tab === "all" && <Panel title="All lifters" action={<span className="font-num text-xs text-muted-foreground">{lifters.length} lifters</span>}>{renderList(lifters)}</Panel>}
          </div>
          <p className="text-xs text-muted-foreground">Read-only. Lists lifters in {scope.name} only. View details to see a lifter's uploaded programs, their own blocks with logged workouts and, for group leaders, each member's blocks. Invitations can only be renewed until the lifter finishes setup.</p>
        </div>
      )}
    </div>
  );
}
