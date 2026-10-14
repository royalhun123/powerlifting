import { useEffect, useState } from "react";
import { useRedeemAccessLink, useBootstrapPrivateLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Panel } from "@/components/common";
import { errMessage } from "@/hooks/use-platform";

export default function SignIn() {
  const [fragmentKey,setFragmentKey]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get("key") || "");
  const [link,setLink]=useState("");
  const [setupKey,setSetupKey]=useState("");
  const redeem=useRedeemAccessLink(),bootstrap=useBootstrapPrivateLogin();
  useEffect(()=>{
    // Fragment credentials are never sent in page requests. Remove them from
    // this browser history entry immediately; retain only in component memory.
    window.history.replaceState(null,"",window.location.pathname);
    const meta=document.createElement("meta");meta.name="referrer";meta.content="no-referrer";document.head.appendChild(meta);
    return ()=>meta.remove();
  },[]);
  const token=fragmentKey || (link.includes("#") ? new URLSearchParams(link.split("#")[1]).get("key") || "" : link.trim());
  return <div className="mx-auto max-w-xl py-8">
    <PageHeader kicker="Navy Powerlifting" title="Private sign-in" />
    <Panel title="Welcome to your training">
      <p className="mb-4 text-sm text-muted-foreground">Use the private link your coach sent you. No password or Replit account is needed. Keep your link private—it grants access to your account.</p>
      <form className="space-y-4" onSubmit={e=>{e.preventDefault();redeem.mutate({data:{token}},{onSuccess:()=>{setLink("");setFragmentKey("");window.location.replace("/");}});}}>
        {fragmentKey ? <div><p className="text-sm">Your private link is ready. Continue below to sign in.</p><Button type="button" variant="link" onClick={()=>setFragmentKey("")}>Use a different link</Button></div> :
          <label className="grid gap-2 text-sm">Private link or access key<Input type="password" autoComplete="off" value={link} onChange={e=>setLink(e.target.value)} placeholder="Paste your private sign-in link" data-testid="private-signin-key" /></label>}
        {redeem.isError && <p role="alert" className="text-sm text-destructive">{errMessage(redeem.error)}</p>}
        <Button type="submit" disabled={redeem.isPending || !/^[A-Za-z0-9_-]{43}$/.test(token)} data-testid="private-signin-submit">{redeem.isPending ? "Signing in…" : "Enter my workspace"}</Button>
      </form>
      <p className="mt-4 text-xs text-muted-foreground">Lost or expired link? Ask your coach for a replacement. On a shared device, sign out when finished.</p>
    </Panel>
    <details className="mt-6 rounded border p-4">
      <summary className="cursor-pointer text-sm">Coach setup or recovery</summary>
      <p className="my-3 text-xs text-muted-foreground">For the site owner only. Use the private setup key configured in your hosting environment. This cannot create an owner in an empty database.</p>
      <form className="space-y-3" onSubmit={e=>{e.preventDefault();bootstrap.mutate({data:{setupKey}},{onSuccess:()=>{setSetupKey("");window.location.replace("/settings");}});}}>
        <Input aria-label="Coach setup key" type="password" autoComplete="off" value={setupKey} onChange={e=>setSetupKey(e.target.value)} />
        {bootstrap.isError && <p role="alert" className="text-sm text-destructive">{errMessage(bootstrap.error)}</p>}
        <Button variant="outline" disabled={bootstrap.isPending || setupKey.length<32}>Recover coach access</Button>
      </form>
    </details>
  </div>;
}
