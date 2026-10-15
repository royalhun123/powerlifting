import { useLayoutEffect, useState } from "react";
import { useRedeemAccessLink, useBootstrapPrivateLogin, usePasswordLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Panel } from "@/components/common";
import { errMessage } from "@/hooks/use-platform";

const KEY_RE = /^[A-Za-z0-9_-]{43}$/;

export default function SignIn() {
  // Compatibility only: an existing /sign-in#key=... link is read from the fragment,
  // stripped from history immediately and kept in memory. No link input is rendered.
  const [fragmentKey, setFragmentKey] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("key") || "");
  const [username, setUsername] = useState(""), [password, setPassword] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const redeem = useRedeemAccessLink(), bootstrap = useBootstrapPrivateLogin(), login = usePasswordLogin();
  useLayoutEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
    const onHashChange = () => {
      const key = new URLSearchParams(window.location.hash.slice(1)).get("key") || "";
      window.history.replaceState(null, "", window.location.pathname);
      setFragmentKey(key); redeem.reset();
    };
    window.addEventListener("hashchange", onHashChange);
    const meta = document.createElement("meta"); meta.name = "referrer"; meta.content = "no-referrer"; document.head.appendChild(meta);
    return () => { meta.remove(); window.removeEventListener("hashchange", onHashChange); };
  }, []);
  const hasKey = KEY_RE.test(fragmentKey);

  return <div className="mx-auto max-w-xl py-8">
    <PageHeader kicker="Navy Powerlifting" title="Sign in" />
    <Panel title="Welcome to your training">
      {hasKey && <div className="mb-5 border-l-2 border-[#B4975A] bg-secondary/50 p-3" data-testid="panel-legacy-link">
        <p className="text-sm">An older private sign-in link was opened on this device.</p>
        {redeem.isError && <p role="alert" className="mt-1 text-sm text-destructive">{errMessage(redeem.error)}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" disabled={redeem.isPending} data-testid="button-legacy-continue" onClick={() => redeem.mutate({ data: { token: fragmentKey } }, { onSuccess: () => { setFragmentKey(""); window.location.replace("/"); } })}>{redeem.isPending ? "Signing in…" : "Continue with this link"}</Button>
          <Button size="sm" variant="ghost" data-testid="button-legacy-dismiss" onClick={() => { setFragmentKey(""); redeem.reset(); }}>Dismiss</Button>
        </div>
      </div>}
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (!username.trim() || !password) return; login.mutate({ data: { username: username.trim(), password } }, { onSuccess: () => { setPassword(""); window.location.replace("/"); } }); }}>
        <label className="grid gap-1.5 text-sm">Username<Input autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e => setUsername(e.target.value)} maxLength={100} data-testid="input-signin-username" /></label>
        <label className="grid gap-1.5 text-sm">Password<Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} maxLength={128} data-testid="input-signin-password" /></label>
        {login.isError && <p role="alert" className="text-sm text-destructive" data-testid="status-signin-error">{errMessage(login.error)}</p>}
        <Button type="submit" disabled={login.isPending || !username.trim() || !password} data-testid="button-signin-password">{login.isPending ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className="mt-4 text-xs text-muted-foreground">New here? Open the invitation link you were sent to choose a username and password. Forgot your password? Create a reset link from Settings while signed in, or ask the team administrator. There is no email reset. On a shared device, sign out when finished.</p>
    </Panel>
    <details className="mt-6 border p-4">
      <summary className="cursor-pointer text-sm">Account setup or recovery</summary>
      <p className="my-3 text-xs text-muted-foreground">For the site owner only. Use the private setup key configured in your hosting environment. This cannot create an owner in an empty database.</p>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); bootstrap.mutate({ data: { setupKey } }, { onSuccess: () => { setSetupKey(""); window.location.replace("/settings"); } }); }}>
        <Input aria-label="Account setup key" type="password" autoComplete="off" value={setupKey} onChange={e => setSetupKey(e.target.value)} data-testid="input-coach-setup-key" />
        {bootstrap.isError && <p role="alert" className="text-sm text-destructive">{errMessage(bootstrap.error)}</p>}
        <Button variant="outline" disabled={bootstrap.isPending || setupKey.length < 32} data-testid="button-coach-recover">Recover account access</Button>
      </form>
    </details>
  </div>;
}
