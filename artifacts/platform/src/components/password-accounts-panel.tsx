import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useListPasswordAccounts, getListPasswordAccountsQueryKey, useCreatePasswordSetup, useRevokePasswordSetup,
  useGetOwnPasswordAccount, getGetOwnPasswordAccountQueryKey, type PasswordAccount,
} from "@workspace/api-client-react";
import { KeyRound, Copy, EyeOff, ShieldCheck, Clock, UserPlus } from "lucide-react";
import { useWorkspace, useInvalidateAll, useMutationGuard, errMessage } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { Panel, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/;

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** True only for a real signed-in (non-demo) session; public pages never call password-account queries. */
function useSignedIn() {
  const { isAuthenticated } = useAuth();
  const { data } = useWorkspace();
  return { signedIn: isAuthenticated && !!data && !data.demo, data };
}

function StatusBadge({ a }: { a: Pick<PasswordAccount, "passwordEnabled" | "setupExpiresAt"> }) {
  const pending = a.setupExpiresAt && Date.parse(a.setupExpiresAt) > Date.now();
  return <span className="flex flex-wrap gap-1.5">
    <span className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${a.passwordEnabled ? "border-[hsl(var(--accessory))]/40 text-[hsl(var(--accessory))]" : "border-border text-muted-foreground"}`}>
      {a.passwordEnabled ? <><ShieldCheck className="h-3 w-3" /> Password set</> : "No password"}
    </span>
    {pending && <span className="inline-flex items-center gap-1 border border-[#B4975A]/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-foreground"><Clock className="h-3 w-3" /> Link pending</span>}
  </span>;
}

export function OwnPasswordAccount() {
  const { signedIn, data } = useSignedIn();
  const own = useGetOwnPasswordAccount({ query: { queryKey: getGetOwnPasswordAccountQueryKey(), enabled: signedIn, staleTime: 20_000, refetchInterval: 60_000 } });
  if (!signedIn) return null;
  return <Panel title="Sign-in account">
    {own.isLoading ? <div className="h-12 animate-pulse bg-muted" data-testid="own-account-loading" /> :
     own.isError ? <ErrorState message={errMessage(own.error)} onRetry={() => own.refetch()} /> : own.data && <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Username</p>
          <p className="font-num text-lg" data-testid="text-own-username">{own.data.username ?? "Not assigned yet"}</p>
        </div>
        <StatusBadge a={own.data} />
      </div>
      {own.data.setupExpiresAt && <p className="text-xs text-muted-foreground">A password setup link is pending until {fmtWhen(own.data.setupExpiresAt)}.</p>}
      <p className="text-sm text-muted-foreground" data-testid="text-own-reset-help">
        {data?.isAdmin && !data?.isCoach ? "To set or reset your own password, create a setup link for “My admin account” in Password accounts below. Your current password keeps working until the new link is used."
          : "To set or reset your own password, create a setup link for “My account” in Password accounts below. Your current password keeps working until the new link is used."}
      </p>
    </div>}
  </Panel>;
}

export function PasswordAccountsPanel({ onCreated }: { onCreated?: () => void } = {}) {
  const { signedIn, data } = useSignedIn();
  const adminOnly = signedIn && !!data?.isAdmin && !data?.isCoach;
  const isCoach = signedIn && (!!data?.isAdmin || (data?.isLifter ?? !data?.isAdmin));
  const selfLabel = adminOnly ? "My admin account" : "My account";
  const qc = useQueryClient(), invalidate = useInvalidateAll(), guard = useMutationGuard();
  const { toast } = useToast();
  const list = useListPasswordAccounts({ query: { queryKey: getListPasswordAccountsQueryKey(), enabled: isCoach, staleTime: 15_000, refetchInterval: 30_000 } });
  const create = useCreatePasswordSetup(), revoke = useRevokePasswordSetup();
  const [target, setTarget] = useState("self");
  const [fresh, setFresh] = useState<{ url: string; label: string; expiresAt: string; invite: boolean } | null>(null);
  if (!isCoach || !data) return null;

  const accounts = (list.data ?? []).filter(a => a.userId === data.profile.id);
  const targetId = target === "self" ? data.profile.id : target;
  const existing = accounts.find(a => a.userId === targetId);
  const label = (a?: PasswordAccount) => a?.userId === data.profile.id ? selfLabel : a?.name || "Invited client";
  const canReset = !create.isPending && (!!existing || (target === "self" && !list.isLoading));
  const pendingTarget = existing?.setupExpiresAt && Date.parse(existing.setupExpiresAt) > Date.now();
  const others = accounts.filter(a => a.userId !== data.profile.id);

  async function refresh() {
    await Promise.all([invalidate(), qc.invalidateQueries({ queryKey: getListPasswordAccountsQueryKey() }), qc.invalidateQueries({ queryKey: getGetOwnPasswordAccountQueryKey() })]);
  }
  const onErr = (e: unknown) => toast({ title: "Could not create link", description: errMessage(e), variant: "destructive" });
  function reset() {
    if (!guard() || !canReset) return;
    if (pendingTarget && !window.confirm("This account already has a pending setup link. Creating a new one immediately invalidates the previous link. Continue?")) return;
    create.mutate({ data: { userId: targetId } }, {
      onSuccess: async r => {
        setFresh({ url: window.location.origin + r.path, label: existing?.username ?? label(existing), expiresAt: r.expiresAt, invite: false });
        await refresh();
        toast({ title: "Setup link created. Copy it now." });
      },
      onError: onErr,
    });
  }

  return <div className="mb-5"><Panel title={<span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4 text-[#B4975A]" /> Password accounts</span>}>
    <p className="mb-3 text-sm text-muted-foreground">{adminOnly ? "Set or reset the password for your own admin account with a one-time setup link (valid 24 hours). Your current password keeps working until the link is used. Lifter accounts are invited from Lifters & groups." : "Set or reset your own password with a one-time link (valid 24 hours). Your username stays the same and your current password keeps working until the link is used. Completing setup signs you out everywhere."}</p>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label className="grid gap-1 text-sm">Account
        <select className="border bg-background p-2" value={target} onChange={e => { setTarget(e.target.value); setFresh(null); create.reset(); }} data-testid="select-password-account">
          <option value="self">{selfLabel}</option>
          {others.map(a => <option key={a.userId} value={a.userId}>{label(a)} ({a.username ?? "username chosen on setup"})</option>)}
        </select>
      </label>
      <Button variant="outline" onClick={reset} disabled={!canReset} data-testid="button-create-password-setup">
        {create.isPending ? "Creating…" : existing?.passwordEnabled ? "Create reset link" : "Create setup link"}
      </Button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground" data-testid="text-target-username">Username: <span className="font-num">{existing?.username ?? "chosen on setup"}</span>{existing?.username ? " (permanent)" : ""}</p>

    {fresh && <div className="rise mt-4 space-y-2 border border-[#B4975A]/60 bg-[#B4975A]/5 p-3" data-testid="panel-fresh-setup-link">
      <p className="text-sm font-medium">Shown only now. Send this privately to <span className="font-num">{fresh.label}</span>. One use, expires {fmtWhen(fresh.expiresAt)}.</p>
      <Input readOnly value={fresh.url} aria-label={fresh.invite ? "New one-time client invitation link" : "New one-time password setup link"} className="font-num text-xs" onFocus={e => e.currentTarget.select()} data-testid="input-fresh-setup-link" />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" data-testid="button-copy-setup-link" onClick={async () => { try { await navigator.clipboard.writeText(fresh.url); toast({ title: "Link copied" }); } catch { toast({ title: "Select and copy the link above", variant: "destructive" }); } }}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link</Button>
        <Button variant="ghost" size="sm" data-testid="button-hide-setup-link" onClick={() => { setFresh(null); create.reset(); }}><EyeOff className="mr-1.5 h-3.5 w-3.5" /> Hide link</Button>
      </div>
    </div>}

    <div className="mt-5">
      {list.isLoading ? <div className="space-y-2" data-testid="password-accounts-loading">{[0, 1, 2].map(i => <div key={i} className="h-11 animate-pulse bg-muted" />)}</div>
       : list.isError ? <ErrorState message={errMessage(list.error)} onRetry={() => list.refetch()} />
       : accounts.length === 0 ? <p className="border border-dashed p-4 text-sm text-muted-foreground" data-testid="password-accounts-empty">{adminOnly ? "No sign-in account found yet. Create a setup link for your admin account above." : "No accounts yet. Create an invitation link above for each client."}</p>
       : <ul className="divide-y border-y">{accounts.map(a => {
          const pending = a.setupExpiresAt && Date.parse(a.setupExpiresAt) > Date.now();
          return <li key={a.userId} className="flex flex-wrap items-center justify-between gap-2 py-2.5" data-testid={`row-password-account-${a.userId}`}>
            <div className="min-w-0">
              <b className="text-sm">{a.name || "Invited client"}</b>{a.userId === data.profile.id && <span className="ml-2 text-xs text-muted-foreground">{adminOnly ? "Admin" : "You"}</span>}
              <p className="font-num text-xs text-muted-foreground">{a.username ?? "Username chosen on setup"}{pending && a.setupExpiresAt ? ` · link expires ${fmtWhen(a.setupExpiresAt)}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge a={a} />
              <Button variant="ghost" size="sm" data-testid={`button-select-password-account-${a.userId}`} onClick={() => { setTarget(a.userId === data.profile.id ? "self" : a.userId); setFresh(null); create.reset(); }}>{a.passwordEnabled ? "Reset" : "Set up"}</Button>
              {pending && <Button variant="outline" size="sm" disabled={revoke.isPending} data-testid={`button-revoke-password-setup-${a.userId}`} onClick={() => {
                if (!guard() || !window.confirm(`Cancel the pending setup link for ${a.name || "this invited client"}? Their current password or sign-in is not affected.`)) return;
                revoke.mutate({ userId: a.userId }, {
                  onSuccess: async () => { setFresh(null); create.reset(); await refresh(); toast({ title: "Setup link cancelled" }); },
                  onError: e => toast({ title: "Could not cancel link", description: errMessage(e), variant: "destructive" }),
                });
              }}>Cancel link</Button>}
            </div>
          </li>;
        })}</ul>}
    </div>
  </Panel></div>;
}
