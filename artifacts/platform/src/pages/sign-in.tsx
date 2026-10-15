import { useLayoutEffect, useState } from "react";
import { useRedeemAccessLink, useBootstrapPrivateLogin, usePasswordLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Panel } from "@/components/common";
import { errMessage } from "@/hooks/use-platform";

export default function SignIn() {
  const [fragmentKey,setFragmentKey]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get("key") || "");
  const [mode,setMode]=useState<"password"|"link">(()=>fragmentKey ? "link" : "password");
  const [username,setUsername]=useState(""),[password,setPassword]=useState("");
  const [link,setLink]=useState("");
  const [setupKey,setSetupKey]=useState("");
  const redeem=useRedeemAccessLink(),bootstrap=useBootstrapPrivateLogin(),login=usePasswordLogin();
  useLayoutEffect(()=>{
    // Fragment credentials are never sent in page requests. Remove them from
    // this browser history entry immediately; retain only in component memory.
    window.history.replaceState(null,"",window.location.pathname);
    const onHashChange=()=>{
      const key=new URLSearchParams(window.location.hash.slice(1)).get("key") || "";
      window.history.replaceState(null,"",window.location.pathname);
      setFragmentKey(key);setLink("");
      if(key) setMode("link");
    };
    window.addEventListener("hashchange",onHashChange);
    const meta=document.createElement("meta");meta.name="referrer";meta.content="no-referrer";document.head.appendChild(meta);
    return ()=>{meta.remove();window.removeEventListener("hashchange",onHashChange);};
  },[]);
  const token=fragmentKey || (link.includes("#") ? new URLSearchParams(link.split("#")[1]).get("key") || "" : link.trim());
  const tab=(m:"password"|"link",label:string)=><button type="button" role="tab" aria-selected={mode===m} onClick={()=>setMode(m)} data-testid={`tab-signin-${m}`}
    className={`flex-1 border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${mode===m ? "border-[#B4975A] text-primary" : "border-transparent text-muted-foreground hover:text-primary"}`}>{label}</button>;
  return <div className="mx-auto max-w-xl py-8">
    <PageHeader kicker="Navy Powerlifting" title="Sign in" />
    <Panel title="Welcome to your training">
      <div role="tablist" aria-label="Sign-in method" className="mb-5 flex border-b">{tab("password","Username and password")}{tab("link","Private link (legacy)")}</div>
      {mode==="password" ? <>
        <form className="space-y-4" onSubmit={e=>{e.preventDefault();if(!username.trim()||!password)return;login.mutate({data:{username:username.trim(),password}},{onSuccess:()=>{setPassword("");window.location.replace("/");}});}}>
          <label className="grid gap-1.5 text-sm">Username<Input autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e=>setUsername(e.target.value)} maxLength={100} data-testid="input-signin-username" /></label>
          <label className="grid gap-1.5 text-sm">Password<Input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} maxLength={128} data-testid="input-signin-password" /></label>
          {login.isError && <p role="alert" className="text-sm text-destructive" data-testid="status-signin-error">{errMessage(login.error)}</p>}
          <Button type="submit" disabled={login.isPending || !username.trim() || !password} data-testid="button-signin-password">{login.isPending ? "Signing in…" : "Sign in"}</Button>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">Forgot your password or have not set one yet? Ask your coach for a reset link. There is no email reset. On a shared device, sign out when finished.</p>
      </> : <>
        <p className="mb-4 text-sm text-muted-foreground">For accounts not yet converted to a password. Use the private link your coach sent you and keep it private. It grants access to your account.</p>
        <form className="space-y-4" onSubmit={e=>{e.preventDefault();redeem.mutate({data:{token}},{onSuccess:()=>{setLink("");setFragmentKey("");window.location.replace("/");}});}}>
          {fragmentKey ? <div><p className="text-sm">Your private link is ready. Continue below to sign in.</p><Button type="button" variant="link" onClick={()=>setFragmentKey("")}>Use a different link</Button></div> :
            <label className="grid gap-2 text-sm">Private link or access key<Input type="password" autoComplete="off" value={link} onChange={e=>setLink(e.target.value)} placeholder="Paste your private sign-in link" data-testid="private-signin-key" /></label>}
          {redeem.isError && <p role="alert" className="text-sm text-destructive">{errMessage(redeem.error)}</p>}
          <Button type="submit" disabled={redeem.isPending || !/^[A-Za-z0-9_-]{43}$/.test(token)} data-testid="private-signin-submit">{redeem.isPending ? "Signing in…" : "Enter my workspace"}</Button>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">Lost or expired link, or already set a password? Use username and password, or ask your coach for a setup link.</p>
      </>}
    </Panel>
    <details className="mt-6 border p-4">
      <summary className="cursor-pointer text-sm">Coach setup or recovery</summary>
      <p className="my-3 text-xs text-muted-foreground">For the site owner only. Use the private setup key configured in your hosting environment. This cannot create an owner in an empty database.</p>
      <form className="space-y-3" onSubmit={e=>{e.preventDefault();bootstrap.mutate({data:{setupKey}},{onSuccess:()=>{setSetupKey("");window.location.replace("/settings");}});}}>
        <Input aria-label="Coach setup key" type="password" autoComplete="off" value={setupKey} onChange={e=>setSetupKey(e.target.value)} data-testid="input-coach-setup-key" />
        {bootstrap.isError && <p role="alert" className="text-sm text-destructive">{errMessage(bootstrap.error)}</p>}
        <Button variant="outline" disabled={bootstrap.isPending || setupKey.length<32} data-testid="button-coach-recover">Recover coach access</Button>
      </form>
    </details>
  </div>;
}
