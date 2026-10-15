import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useListPasswordAccounts, getListPasswordAccountsQueryKey, useCreatePasswordSetup, useRevokePasswordSetup,
  useGetOwnPasswordAccount, getGetOwnPasswordAccountQueryKey, type PasswordAccount,
} from "@workspace/api-client-react";
import { KeyRound, Copy, EyeOff, ShieldCheck, Clock } from "lucide-react";
import { useWorkspace, useInvalidateAll, useMutationGuard, errMessage } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { Panel, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PrivateAccessPanel } from "@/components/private-access-panel";

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
          : data?.isCoach ? "To set or reset your own password, create a setup link for “My coach account” in Password accounts below."
          : own.data.passwordEnabled ? "Forgot or want to change your password? Ask your coach for a reset link. Your current password keeps working until the new link is used."
          : "Your coach can send you a one-time link to choose a password. Until then, keep using your private link."}
      </p>
    </div>}
  </Panel>;
}

export function PasswordAccountsPanel() {
  const { signedIn, data } = useSignedIn();
  const adminOnly = signedIn && !!data?.isAdmin && !data?.isCoach;
  const isCoach = signedIn && (!!data?.isCoach || adminOnly);
  const selfLabel = adminOnly ? "My admin account" : "My coach account";
  const qc = useQueryClient(), invalidate = useInvalidateAll(), guard = useMutationGuard();
  const { toast } = useToast();
  const list = useListPasswordAccounts({ query: { queryKey: getListPasswordAccountsQueryKey(), enabled: isCoach, staleTime: 15_000, refetchInterval: 30_000 } });
  const create = useCreatePasswordSetup(), revoke = useRevokePasswordSetup();
  const [target, setTarget] = useState("self"), [name, setName] = useState(""), [username, setUsername] = useState("");
  const [fresh, setFresh] = useState<{ url: string; username: string; expiresAt: string } | null>(null);
  if (!isCoach || !data) return null;

  const accounts = adminOnly ? (list.data ?? []).filter(a => a.userId === data.profile.id) : (list.data ?? []);
  const targetId = target === "self" ? data.profile.id : target;
  const existing = target === "new" ? undefined : accounts.find(a => a.userId === targetId);
  const lockedName = existing?.username ?? null;
  const effUser = lockedName ?? username.trim();
  const validUser = USERNAME_RE.test(effUser);
  const canCreate = !create.isPending && validUser && (target !== "new" || !!name.trim()) && (target === "new" || !!existing || !list.isLoading);
  const pendingTarget = existing?.setupExpiresAt && Date.parse(existing.setupExpiresAt) > Date.now();
  const selectable = [{ userId: data.profile.id, label: selfLabel }, ...accounts.filter(a => a.userId !== data.profile.id).map(a => ({ userId: a.userId, label: a.name }))];

  async function refresh() {
    await Promise.all([invalidate(), qc.invalidateQueries({ queryKey: getListPasswordAccountsQueryKey() }), qc.invalidateQueries({ queryKey: getGetOwnPasswordAccountQueryKey() })]);
  }
  function submit() {
    if (!guard() || !canCreate) return;
    if (pendingTarget && !window.confirm("This account already has a pending setup link. Creating a new one immediately invalidates the previous link. Continue?")) return;
    const body = target === "new" ? { name: name.trim(), username: effUser } : { userId: targetId, username: effUser };
    create.mutate({ data: body }, {
      onSuccess: async r => {
        setFresh({ url: window.location.origin + r.path, username: r.username, expiresAt: r.expiresAt });
        setName(""); setUsername("");
        if (target === "new") setTarget(r.userId);
        await refresh();
        toast({ title: "Setup link created. Copy it now." });
      },
      onError: e => toast({ title: "Could not create setup link", description: errMessage(e), variant: "destructive" }),
    });
  }

  return <div className="mb-5"><Panel title={<span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4 text-[#B4975A]" /> Password accounts</span>}>
    <p className="mb-4 text-sm text-muted-foreground">{adminOnly ? "Set or reset the password for your own admin account with a one-time setup link (valid 24 hours). Your current password keeps working until the link is used. Coach accounts are created from the Coaches page." : <>Give each lifter a username and a one-time setup link (valid 24 hours) so they can choose their own password. A reset link keeps the current password working until it is used. Completing setup signs that account out everywhere and retires its old private links.</>}</p>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label className="grid gap-1 text-sm">Account
        <select className="border bg-background p-2" value={target} onChange={e => { setTarget(e.target.value); setFresh(null); create.reset(); }} data-testid="select-password-account">
          <option value="self">{selfLabel}</option>
          {!adminOnly && <option value="new">New client</option>}
          {selectable.slice(1).map(a => <option key={a.userId} value={a.userId}>{a.label} (existing client)</option>)}
        </select>
      </label>
      {target === "new" && <label className="grid gap-1 text-sm sm:col-start-1">Client name
        <Input value={name} onChange={e => setName(e.target.value)} maxLength={100} data-testid="input-password-client-name" /></label>}
      <label className="grid gap-1 text-sm">Username
        {lockedName ? <Input value={lockedName} readOnly aria-readonly="true" className="bg-muted font-num" data-testid="input-password-username-locked" />
          : <Input value={username} onChange={e => setUsername(e.target.value)} maxLength={32} autoComplete="off" spellCheck={false} className="font-num" aria-invalid={!!username && !validUser} aria-describedby="username-rules" data-testid="input-password-username" />}
      </label>
      <Button onClick={submit} disabled={!canCreate} data-testid="button-create-password-setup">
        {create.isPending ? "Creating…" : existing?.passwordEnabled ? "Create reset link" : "Create setup link"}
      </Button>
    </div>
    <p id="username-rules" className="mt-2 text-xs text-muted-foreground">
      {lockedName ? "Username is assigned and cannot be renamed. A new link resets the password for this username." : "3–32 characters: letters, digits, dot, underscore or dash; must start with a letter or digit. Not case-sensitive; must be unique."}
      {target === "new" && " New clients start with a password account; no reusable link needed."}
    </p>
    {username && !lockedName && !validUser && <p role="alert" className="mt-1 text-xs text-destructive">Username format is not valid.</p>}

    {fresh && <div className="rise mt-4 space-y-2 border border-[#B4975A]/60 bg-[#B4975A]/5 p-3" data-testid="panel-fresh-setup-link">
      <p className="text-sm font-medium">Shown only now. Send this privately to <span className="font-num">{fresh.username}</span>. One use, expires {fmtWhen(fresh.expiresAt)}.</p>
      <Input readOnly value={fresh.url} aria-label="New one-time password setup link" className="font-num text-xs" onFocus={e => e.currentTarget.select()} data-testid="input-fresh-setup-link" />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" data-testid="button-copy-setup-link" onClick={async () => { try { await navigator.clipboard.writeText(fresh.url); toast({ title: "Setup link copied" }); } catch { toast({ title: "Select and copy the link above", variant: "destructive" }); } }}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link</Button>
        <Button variant="ghost" size="sm" data-testid="button-hide-setup-link" onClick={() => { setFresh(null); create.reset(); }}><EyeOff className="mr-1.5 h-3.5 w-3.5" /> Hide link</Button>
      </div>
    </div>}

    <div className="mt-5">
      {list.isLoading ? <div className="space-y-2" data-testid="password-accounts-loading">{[0, 1, 2].map(i => <div key={i} className="h-11 animate-pulse bg-muted" />)}</div>
       : list.isError ? <ErrorState message={errMessage(list.error)} onRetry={() => list.refetch()} />
       : accounts.length === 0 ? <p className="border border-dashed p-4 text-sm text-muted-foreground" data-testid="password-accounts-empty">{adminOnly ? "No sign-in account found yet. Create a setup link for your admin account above." : "No accounts yet. Start with your own coach account, then add each client."}</p>
       : <ul className="divide-y border-y">{accounts.map(a => {
          const pending = a.setupExpiresAt && Date.parse(a.setupExpiresAt) > Date.now();
          return <li key={a.userId} className="flex flex-wrap items-center justify-between gap-2 py-2.5" data-testid={`row-password-account-${a.userId}`}>
            <div className="min-w-0">
              <b className="text-sm">{a.name}</b>{a.userId === data.profile.id && <span className="ml-2 text-xs text-muted-foreground">{adminOnly ? "Admin" : "Coach"}</span>}
              <p className="font-num text-xs text-muted-foreground">{a.username ?? "no username"}{pending && a.setupExpiresAt ? ` · link expires ${fmtWhen(a.setupExpiresAt)}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge a={a} />
              <Button variant="ghost" size="sm" data-testid={`button-select-password-account-${a.userId}`} onClick={() => { setTarget(a.userId === data.profile.id ? "self" : a.userId); setFresh(null); create.reset(); }}>{a.passwordEnabled ? "Reset" : "Set up"}</Button>
              {pending && <Button variant="outline" size="sm" disabled={revoke.isPending} data-testid={`button-revoke-password-setup-${a.userId}`} onClick={() => {
                if (!guard() || !window.confirm(`Cancel the pending setup link for ${a.name}? Their current password or sign-in is not affected.`)) return;
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

export function LegacyAccessDetails() {
  const { signedIn, data } = useSignedIn();
  if (!signedIn || !data?.isCoach) return null;
  return <details className="mb-5 border p-4" data-testid="details-legacy-access">
    <summary className="cursor-pointer text-sm font-medium">Legacy migration details: reusable private links</summary>
    <p className="my-3 text-xs text-muted-foreground">For accounts not yet converted to passwords. New reusable links cannot be created for password-enabled accounts. Prefer password setup links above.</p>
    <PrivateAccessPanel />
  </details>;
}
