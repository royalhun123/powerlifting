import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateCoach, useListCoaches, getListCoachesQueryKey, type CoachDirectoryEntry } from "@workspace/api-client-react";
import { ChevronDown, Clock, Copy, EyeOff, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { CoachProgramInspector } from "@/components/program-inspector";
import { HistoryIcon, SessionHistoryPanel, type HistoryTarget } from "@/components/session-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, PageHeader, Panel } from "@/components/common";
import { USERNAME_RE } from "@/components/password-accounts-panel";
import { errMessage, useMutationGuard } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

type Fresh = { url: string; username: string; expiresAt: string };

export default function Coaches() {
  const qc = useQueryClient();
  const guard = useMutationGuard();
  const { toast } = useToast();
  const list = useListCoaches({ query: { queryKey: getListCoachesQueryKey(), staleTime: 15_000, refetchInterval: 30_000 } });
  const create = useCreateCoach();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [fresh, setFresh] = useState<Fresh | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryTarget | null>(null);
  const toggleHistory = (t: HistoryTarget) => setHistory(history?.id === t.id ? null : t);

  const u = username.trim();
  const validUser = USERNAME_RE.test(u);
  const canCreate = !create.isPending && validUser && !!name.trim();

  const onLink = async (r: { path: string; username: string; expiresAt: string }) => {
    setFresh({ url: window.location.origin + r.path, username: r.username, expiresAt: r.expiresAt });
    await qc.invalidateQueries({ queryKey: getListCoachesQueryKey() });
    toast({ title: "Invitation link created. Copy it now." });
  };

  const submit = () => {
    if (!guard() || !canCreate) return;
    create.mutate({ data: { name: name.trim(), username: u } }, {
      onSuccess: async (r) => { setName(""); setUsername(""); await onLink(r); },
      onError: (e) => toast({ title: "Could not create coach", description: errMessage(e), variant: "destructive" }),
    });
  };

  const renew = (c: CoachDirectoryEntry) => {
    if (!guard() || c.passwordEnabled) return;
    if (!window.confirm(`Create a new invitation for ${c.name}? Any earlier invitation link stops working immediately.`)) return;
    setRenewingId(c.userId);
    create.mutate({ data: { userId: c.userId, username: c.username } }, {
      onSuccess: onLink,
      onError: (e) => toast({ title: "Could not renew invitation", description: errMessage(e), variant: "destructive" }),
      onSettled: () => setRenewingId(null),
    });
  };

  const coaches = (list.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader kicker="Admin · Coaching staff" title="Coaches" />

      <div className="mb-6">
        <Panel title={<span className="inline-flex items-center gap-2"><UserPlus className="h-4 w-4 text-[#B4975A]" /> Onboard a coach</span>}>
          <p className="mb-4 text-sm text-muted-foreground">
            Each coach runs an independent roster and shares the program library. Create the account with a name and username, then send the one-time link privately so they choose their own password. Links last 24 hours.
          </p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="grid gap-1 text-sm">Coach name
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} data-testid="input-coach-name" />
            </label>
            <label className="grid gap-1 text-sm">Username
              <Input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={32} autoComplete="off" spellCheck={false} className="font-num" aria-invalid={!!username && !validUser} aria-describedby="coach-username-rules" data-testid="input-coach-username" />
            </label>
            <Button onClick={submit} disabled={!canCreate} data-testid="button-create-coach">
              {create.isPending && !renewingId ? "Creating…" : "Create invitation"}
            </Button>
          </div>
          <p id="coach-username-rules" className="mt-2 text-xs text-muted-foreground">3–32 characters: letters, digits, dot, underscore or dash; must start with a letter or digit. Unique and permanent.</p>
          {username && !validUser && <p role="alert" className="mt-1 text-xs text-destructive">Username format is not valid.</p>}

          {fresh && (
            <div className="rise mt-4 space-y-2 border border-[#B4975A]/60 bg-[#B4975A]/5 p-3" data-testid="panel-fresh-coach-link">
              <p className="text-sm font-medium">Shown only now. Send this privately to <span className="font-num">{fresh.username}</span>. One use, expires {fmtWhen(fresh.expiresAt)}.</p>
              <Input readOnly value={fresh.url} aria-label="New one-time coach invitation link" className="font-num text-xs" onFocus={(e) => e.currentTarget.select()} data-testid="input-fresh-coach-link" />
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

      <Panel title="Coach directory" action={<span className="font-num text-xs text-muted-foreground" data-testid="text-coach-count">{coaches.length} coach{coaches.length === 1 ? "" : "es"}</span>}>
        <p className="mb-4 text-xs text-muted-foreground">Read-only. Expand a coach to inspect uploaded programs and running blocks, open History for a coach's own logged workouts, or click any client name for theirs. Established coaches manage their own clients and password; invitations can only be renewed until the coach finishes setup.</p>
        {list.isLoading ? (
          <div className="space-y-2" data-testid="coaches-loading">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse bg-muted" />)}</div>
        ) : list.isError ? (
          <ErrorState message={errMessage(list.error)} onRetry={() => list.refetch()} />
        ) : coaches.length === 0 ? (
          <EmptyState title="No coaches yet" body="Create the first invitation above." />
        ) : (
          <ul className="divide-y border-y">
            {coaches.map((c) => (
              <li key={c.userId} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start" data-testid={`row-coach-${c.userId}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-xl font-bold uppercase">{c.name}</span>
                    <span className="font-num text-xs text-muted-foreground">{c.username}</span>
                    {c.passwordEnabled ? (
                      <span className="inline-flex items-center gap-1 border border-[hsl(var(--accessory))]/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--accessory))]"><ShieldCheck className="h-3 w-3" /> Active</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 border border-[#B4975A]/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-foreground"><Clock className="h-3 w-3" /> Invited</span>
                    )}
                  </div>
                  <p className="mt-0.5 font-num text-[11px] text-muted-foreground">Added {fmtWhen(c.createdAt)} · {c.clients.length} client{c.clients.length === 1 ? "" : "s"}</p>
                  {c.clients.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`list-coach-clients-${c.userId}`}>
                      <span className="self-center font-num text-[10px] uppercase tracking-widest text-muted-foreground">History:</span>
                      {c.clients.map((cl) => (
                        <button key={cl.id} type="button" aria-pressed={history?.id === cl.id} onClick={() => toggleHistory({ id: cl.id, name: cl.name, role: "client", coachName: c.name })}
                          className={`inline-flex items-center px-1.5 py-0.5 text-xs transition-colors ${history?.id === cl.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-primary/15"}`}
                          data-testid={`button-history-client-${cl.id}`}>{cl.name}</button>
                      ))}
                    </div>
                  )}
                  {openId === c.userId && <CoachProgramInspector c={c} />}
                  {history && (history.id === c.userId || c.clients.some((cl) => cl.id === history.id)) && <SessionHistoryPanel key={history.id} target={history} onClose={() => setHistory(null)} />}
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                <Button variant="ghost" size="sm" aria-expanded={openId === c.userId} onClick={() => setOpenId(openId === c.userId ? null : c.userId)} data-testid={`button-inspect-coach-${c.userId}`}>
                  <ChevronDown className={`mr-1.5 h-3.5 w-3.5 transition-transform ${openId === c.userId ? "rotate-180" : ""}`} /> {openId === c.userId ? "Hide programs" : `Programs (${c.programs?.length ?? 0})`}
                </Button>
                <Button variant="ghost" size="sm" aria-pressed={history?.id === c.userId} onClick={() => toggleHistory({ id: c.userId, name: c.name, role: "coach", coachName: c.name })} data-testid={`button-history-coach-${c.userId}`}>
                  <HistoryIcon /> {history?.id === c.userId ? "Hide history" : "History"}
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
        )}
      </Panel>
    </div>
  );
}
