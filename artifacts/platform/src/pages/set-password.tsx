import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useGetPasswordSetupInfo, useCompletePasswordSetup } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Panel } from "@/components/common";
import { errMessage } from "@/hooks/use-platform";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export default function SetPassword() {
  // Token lives only in React state; never rendered, logged, or kept in the URL.
  const [visit, setVisit] = useState(() => ({ token: new URLSearchParams(window.location.hash.slice(1)).get("token") || "" }));
  const { token } = visit;
  const [pw, setPw] = useState(""), [confirm, setConfirm] = useState("");
  const info = useGetPasswordSetupInfo(), complete = useCompletePasswordSetup();
  const started = useRef<typeof visit | null>(null);
  const infoMutate = useRef(info.mutate); infoMutate.current = info.mutate;

  useLayoutEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
    // Navigating to a different fragment on this same route does not remount
    // the component. Always strip it and revalidate, including invalid links.
    const onHashChange = () => {
      const next = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
      window.history.replaceState(null, "", window.location.pathname);
      setPw(""); setConfirm("");
      info.reset(); complete.reset();
      setVisit({ token: next });
    };
    window.addEventListener("hashchange", onHashChange);
    const meta = document.createElement("meta"); meta.name = "referrer"; meta.content = "no-referrer"; document.head.appendChild(meta);
    return () => { meta.remove(); window.removeEventListener("hashchange", onHashChange); };
  }, []);
  useEffect(() => {
    if (started.current === visit || !TOKEN_RE.test(token)) return;
    started.current = visit;
    infoMutate.current({ data: { token } });
  }, [token, visit]);

  const tooShort = pw.length > 0 && pw.length < 12, tooLong = pw.length > 128, mismatch = confirm.length > 0 && pw !== confirm;
  const ok = pw.length >= 12 && pw.length <= 128 && pw === confirm;
  const help = "Ask your coach for a replacement setup link. Links work once and expire after 24 hours.";

  return <div className="mx-auto max-w-xl py-8">
    <PageHeader kicker="Navy Powerlifting" title="Set your password" />
    <Panel title="One-time setup">
      {!TOKEN_RE.test(token) ? <div role="alert" data-testid="status-setup-missing">
        <p className="text-sm">This page needs a valid setup link. If you refreshed or the link was incomplete, it can no longer be read here.</p>
        <p className="mt-2 text-sm text-muted-foreground">{help}</p>
      </div>
      : info.isPending || info.isIdle ? <div className="space-y-3" data-testid="status-setup-loading" aria-busy="true"><div className="h-5 w-2/3 animate-pulse bg-muted" /><div className="h-10 animate-pulse bg-muted" /><div className="h-10 animate-pulse bg-muted" /></div>
      : info.isError ? <div role="alert" data-testid="status-setup-invalid">
        <p className="text-sm font-medium text-destructive">This setup link is expired, already used, or was replaced.</p>
        <p className="mt-1 text-xs text-muted-foreground">{errMessage(info.error)}</p>
        <p className="mt-3 text-sm">{help}</p>
      </div>
      : info.data && <form className="space-y-4" onSubmit={e => {
          e.preventDefault(); if (!ok || complete.isPending) return;
          complete.mutate({ data: { token, password: pw } }, { onSuccess: () => { setPw(""); setConfirm(""); window.location.replace("/"); } });
        }}>
        <input type="text" name="username" autoComplete="username" value={info.data.username} readOnly hidden />
        <div className="border-l-2 border-[#B4975A] bg-secondary/50 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Your username</p>
          <p className="font-num text-lg" data-testid="text-setup-username">{info.data.username}</p>
          <p className="text-xs text-muted-foreground" data-testid="text-setup-expires">Link expires {new Date(info.data.expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
        </div>
        <label className="grid gap-1.5 text-sm">New password
          <Input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} maxLength={128} aria-describedby="pw-rules" aria-invalid={tooShort || tooLong} data-testid="input-new-password" />
        </label>
        <label className="grid gap-1.5 text-sm">Confirm password
          <Input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} maxLength={128} aria-invalid={mismatch} data-testid="input-confirm-password" />
        </label>
        <p id="pw-rules" className={`text-xs ${tooShort || tooLong ? "text-destructive" : "text-muted-foreground"}`}>12 to 128 characters. A short phrase is easier to remember. {pw.length > 0 && <span className="font-num">({pw.length})</span>}</p>
        {mismatch && <p role="alert" className="text-xs text-destructive">Passwords do not match.</p>}
        {complete.isError && <div role="alert" className="text-sm text-destructive">{errMessage(complete.error)}<p className="mt-1 text-xs text-muted-foreground">If the link expired or was used, {help.charAt(0).toLowerCase() + help.slice(1)}</p></div>}
        <p className="text-xs text-muted-foreground">Saving signs this account out on every other device and retires any old private links.</p>
        <Button type="submit" disabled={!ok || complete.isPending} data-testid="button-complete-setup">{complete.isPending ? "Saving…" : "Save password and sign in"}</Button>
      </form>}
    </Panel>
    <p className="mt-4 text-center text-xs"><Link href="/sign-in" className="text-primary underline-offset-4 hover:underline" data-testid="link-back-sign-in">Back to sign in</Link></p>
  </div>;
}
