import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CheckCircle2, Users, XCircle } from "lucide-react";
import { useAcceptGroupInvitation, useGetGroupInvitationInfo, usePasswordLogin } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMessage } from "@/hooks/use-platform";
import { GROUP_INVITE_KEY } from "@/lib/pl";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const USER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/;

function readHash() {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
}
function statusOf(e: unknown) {
  return (e as { status?: number } | null)?.status ?? 0;
}

export default function JoinGroup() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [token, setToken] = useState(() => readHash() || sessionStorage.getItem(GROUP_INVITE_KEY) || "");
  const info = useGetGroupInvitationInfo();
  const accept = useAcceptGroupInvitation();
  const login = usePasswordLogin();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [username, setUsername] = useState(""), [password, setPassword] = useState(""), [name, setName] = useState("");
  const [lu, setLu] = useState(""), [lp, setLp] = useState("");
  const [done, setDone] = useState(false);
  const infoFor = useRef("");
  const infoMutate = useRef(info.mutate); infoMutate.current = info.mutate;

  // Strip the token from the URL immediately; keep it in memory only. Same-route hash updates are honoured.
  useLayoutEffect(() => {
    const strip = () => window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (window.location.hash) strip();
    const onHash = () => { const t = readHash(); strip(); if (t) { setToken(t); setDone(false); accept.reset(); } };
    window.addEventListener("hashchange", onHash);
    const meta = document.createElement("meta"); meta.name = "referrer"; meta.content = "no-referrer"; document.head.appendChild(meta);
    return () => { window.removeEventListener("hashchange", onHash); meta.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valid = TOKEN_RE.test(token);
  useEffect(() => {
    if (!valid || infoFor.current === token) return;
    infoFor.current = token;
    infoMutate.current({ data: { token } });
  }, [token, valid]);

  const clear = () => { sessionStorage.removeItem(GROUP_INVITE_KEY); setToken(""); };
  const dismiss = () => { clear(); setLocation(isAuthenticated ? "/" : "/sign-in"); };

  const joinExisting = () => accept.mutate({ data: { token } }, {
    onSuccess: async () => { clear(); setDone(true); await qc.invalidateQueries(); },
  });
  const signup = () => {
    if (!USER_RE.test(username) || password.length < 12) return;
    accept.mutate({ data: { token, username, password, ...(name.trim() ? { name: name.trim() } : {}) } }, {
      onSuccess: () => { sessionStorage.removeItem(GROUP_INVITE_KEY); setPassword(""); window.location.replace(import.meta.env.BASE_URL || "/"); },
    });
  };
  const signin = () => {
    if (!lu.trim() || !lp) return;
    sessionStorage.setItem(GROUP_INVITE_KEY, token);
    login.mutate({ data: { username: lu.trim(), password: lp } }, {
      onSuccess: () => { setLp(""); window.location.replace(`${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/join-group`); },
    });
  };

  const st = statusOf(accept.error);
  const acceptMsg = !accept.isError ? "" : st === 409 && !isAuthenticated && mode === "signup" && /user/i.test(errMessage(accept.error))
    ? "That username is taken. Choose another; your details and invitation are kept."
    : st === 403 || st === 409 ? `${errMessage(accept.error)} If you already belong to a lifting group, leave it first from Lifting group, then open this link again. Accounts are never moved between workspaces.`
    : errMessage(accept.error);

  const Shell = ({ children }: { children: ReactNode }) => (
    <div className="chalk-grid flex min-h-[70vh] items-center justify-center">
      <div className="rise w-full max-w-md overflow-hidden rounded-md border bg-card">
        <div className="plate-stripe h-1.5" />
        <div className="p-8">
          <div className="font-num text-[11px] uppercase tracking-[0.22em] text-primary">Lifting group invitation</div>
          {children}
        </div>
      </div>
    </div>
  );

  if (done) return Shell({ children: <div className="text-center">
    <CheckCircle2 className="mx-auto mt-4 h-10 w-10" style={{ color: "hsl(var(--accessory))" }} />
    <h1 className="mt-2 font-display text-4xl font-bold uppercase">You joined</h1>
    <p className="mt-2 text-sm text-muted-foreground">Your group leader can now assign blocks and review your training. You keep full access to the program library and your own history.</p>
    <Button className="mt-6 w-full" onClick={() => setLocation("/group")} data-testid="button-join-group-continue">Open Lifting group</Button>
  </div> });

  if (!valid) return Shell({ children: <>
    <h1 className="mt-2 font-display text-4xl font-bold uppercase">No invitation</h1>
    <p className="mt-2 text-sm text-muted-foreground">This link is missing its invitation token. Ask your group leader for a new one-time link.</p>
    <Button variant="ghost" className="mt-4" onClick={dismiss} data-testid="button-join-group-home">Back</Button>
  </> });

  if (info.isError) return Shell({ children: <div className="text-center">
    <XCircle className="mx-auto mt-4 h-10 w-10 text-destructive" />
    <h1 className="mt-2 font-display text-4xl font-bold uppercase">Link not valid</h1>
    <p className="mt-2 text-sm text-muted-foreground" data-testid="text-join-group-error">{errMessage(info.error)} Links expire after 24 hours and work once.</p>
    <Button variant="ghost" className="mt-4" onClick={dismiss} data-testid="button-join-group-dismiss">Dismiss</Button>
  </div> });

  const dest = info.data ? <div className="mt-3 border-l-2 border-[#B4975A] bg-secondary/50 p-3">
    <div className="flex items-center gap-2 font-display text-2xl font-bold uppercase leading-none" data-testid="text-join-group-name"><Users className="h-5 w-5 text-[#B4975A]" />{info.data.name}</div>
    <div className="mt-1 font-num text-[11px] text-muted-foreground" data-testid="text-join-group-workspace">{info.data.workspaceName}</div>
  </div> : <div className="mt-3 h-16 animate-pulse bg-muted" />;

  if (isLoading) return Shell({ children: <div className="mt-6 h-8 w-40 animate-pulse rounded bg-muted" /> });

  if (isAuthenticated) return Shell({ children: <>
    <h1 className="mt-2 font-display text-4xl font-bold uppercase">Join this group?</h1>
    {dest}
    <p className="mt-3 text-sm text-muted-foreground">The group leader will see your workout history, bodyweights and progress, can assign you blocks and discuss sessions. You keep logging your own training and keep full library access.</p>
    {accept.isError && <p role="alert" className="mt-3 text-sm text-destructive" data-testid="status-join-group-error">{acceptMsg}</p>}
    <Button className="mt-6 w-full" disabled={!info.data || accept.isPending} onClick={joinExisting} data-testid="button-join-group-confirm">{accept.isPending ? "Joining…" : "Confirm and join"}</Button>
    <Button variant="ghost" className="mt-2 w-full" onClick={dismiss} data-testid="button-join-group-decline">Not now</Button>
  </> });

  return Shell({ children: <>
    <h1 className="mt-2 font-display text-4xl font-bold uppercase">Join the group</h1>
    {dest}
    <div className="mt-5 grid grid-cols-2 border" role="tablist">
      {(["signup", "login"] as const).map((m) => (
        <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`py-2 text-xs font-semibold uppercase tracking-[0.12em] ${mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} data-testid={`tab-join-group-${m}`}>
          {m === "signup" ? "New account" : "I have an account"}
        </button>
      ))}
    </div>
    {mode === "signup" ? (
      <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); signup(); }}>
        <label className="grid gap-1.5 text-sm">Username
          <Input autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} maxLength={32} onChange={(e) => setUsername(e.target.value)} data-testid="input-join-group-username" />
          <span className="text-xs text-muted-foreground">3–32 letters, numbers, dot, dash or underscore. Permanent.</span>
        </label>
        <label className="grid gap-1.5 text-sm">Name <span className="text-xs text-muted-foreground">(optional)</span>
          <Input autoComplete="name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} data-testid="input-join-group-name" />
        </label>
        <label className="grid gap-1.5 text-sm">Password
          <Input type="password" autoComplete="new-password" value={password} maxLength={128} onChange={(e) => setPassword(e.target.value)} data-testid="input-join-group-password" />
          <span className="text-xs text-muted-foreground">At least 12 characters.</span>
        </label>
        {accept.isError && <p role="alert" className="text-sm text-destructive" data-testid="status-join-group-error">{acceptMsg}</p>}
        <Button type="submit" className="w-full" disabled={!info.data || accept.isPending || !USER_RE.test(username) || password.length < 12} data-testid="button-join-group-signup">{accept.isPending ? "Creating account…" : "Create account and join"}</Button>
      </form>
    ) : (
      <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); signin(); }}>
        <p className="text-xs text-muted-foreground">Sign in and you'll come straight back here to confirm. The invitation is held in this tab only.</p>
        <label className="grid gap-1.5 text-sm">Username<Input autoComplete="username" autoCapitalize="none" spellCheck={false} value={lu} maxLength={100} onChange={(e) => setLu(e.target.value)} data-testid="input-join-group-login-username" /></label>
        <label className="grid gap-1.5 text-sm">Password<Input type="password" autoComplete="current-password" value={lp} maxLength={128} onChange={(e) => setLp(e.target.value)} data-testid="input-join-group-login-password" /></label>
        {login.isError && <p role="alert" className="text-sm text-destructive">{errMessage(login.error)}</p>}
        <Button type="submit" className="w-full" disabled={login.isPending || !lu.trim() || !lp} data-testid="button-join-group-login">{login.isPending ? "Signing in…" : "Sign in to continue"}</Button>
      </form>
    )}
    <Button variant="ghost" className="mt-2 w-full" onClick={dismiss} data-testid="button-join-group-decline">Dismiss invitation</Button>
  </> });
}
