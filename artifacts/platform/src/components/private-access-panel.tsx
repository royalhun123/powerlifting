import { useState } from "react";
import { useCreateAccessLink, useListAccessLinks, useRevokeAccessLink, getListAccessLinksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspace, useInvalidateAll, useMutationGuard, errMessage } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { Panel, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDate } from "@/lib/pl";

export function PrivateAccessPanel() {
  const {data}=useWorkspace();
  const qc=useQueryClient(),invalidate=useInvalidateAll(),guard=useMutationGuard();
  const {toast}=useToast();
  const links=useListAccessLinks({query:{queryKey:getListAccessLinksQueryKey(),enabled:!!data?.isCoach,staleTime:20_000,refetchInterval:60_000}});
  const create=useCreateAccessLink(),revoke=useRevokeAccessLink();
  const [target,setTarget]=useState("self"),[name,setName]=useState(""),[fresh,setFresh]=useState("");
  if(!data?.isCoach) return null;
  async function refresh() {
    await Promise.all([invalidate(),qc.invalidateQueries({queryKey:getListAccessLinksQueryKey()})]);
  }
  return <div className="mb-5"><Panel title="Legacy private sign-in links">
    <p className="mb-3 text-sm text-muted-foreground">Legacy migration only. Use these only for accounts that have not been converted to username and password; the server rejects new reusable links for password-enabled accounts. Links expire in 6 months; browsers stay signed in for up to 30 days. Anyone holding a link can access that account. Share privately. Revoking a link also ends its remembered sessions.</p>
    <details className="mb-4 text-xs text-muted-foreground"><summary className="cursor-pointer">Vercel coach account setting</summary><p className="mt-2">Set COACH_USER_ID to <code className="select-all">{data.profile.id}</code> on the new host. This account ID is not a sign-in key.</p></details>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">Account
        <select className="rounded border bg-background p-2" value={target} onChange={e=>{setTarget(e.target.value);setFresh("");}} data-testid="private-link-account">
          <option value="self">My coach account</option><option value="new">Create a new client</option>
          {data.athletes.map(a=><option key={a.id} value={a.id}>{a.name} — existing client</option>)}
        </select>
      </label>
      {target==="new" && <label className="grid gap-1 text-sm">Client name<Input value={name} onChange={e=>setName(e.target.value)} maxLength={100} data-testid="private-link-client-name" /></label>}
      <Button disabled={create.isPending || target==="new" && !name.trim()} data-testid="create-private-link" onClick={()=>{
        if(!guard()) return;
        create.mutate({data:target==="new" ? {name:name.trim()} : {userId:target==="self" ? data.profile.id : target}},{
          onSuccess:async result=>{setFresh(window.location.origin+result.path);setName("");await refresh();toast({title:"Private link created. Copy it now."});},
          onError:e=>toast({title:"Could not create link",description:errMessage(e),variant:"destructive"}),
        });
      }}>{create.isPending ? "Creating…" : "Create private link"}</Button>
    </div>
    {fresh && <div className="mt-4 space-y-2 rounded border p-3">
      <p className="text-sm font-medium">Shown only now—save this link somewhere private.</p>
      <Input readOnly value={fresh} aria-label="New private sign-in link" />
      <Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(fresh);toast({title:"Private link copied"});}catch{toast({title:"Select and copy the link above",variant:"destructive"});}}} data-testid="copy-private-link">Copy private link</Button>
      <Button variant="ghost" onClick={()=>{setFresh("");create.reset();}}>Hide link</Button>
    </div>}
    {links.isError ? <ErrorState message={errMessage(links.error)} onRetry={()=>links.refetch()} /> :
      <ul className="mt-4 divide-y">{links.data?.map(link=><li key={link.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div><b className="text-sm">{link.name}</b><p className="text-xs text-muted-foreground">{Date.parse(link.expiresAt)<=Date.now() ? "Expired" : "Expires"} {fmtDate(link.expiresAt.slice(0,10))}{link.userId===data.profile.id ? " · Coach" : ""}</p></div>
        <Button variant="outline" size="sm" disabled={revoke.isPending} data-testid={`revoke-private-link-${link.id}`} onClick={()=>{
          if(!guard() || !window.confirm(`Revoke this link for ${link.name}? Anyone signed in with it will be signed out. If this is your current coach link, save another coach link first.`)) return;
          revoke.mutate({id:link.id},{onSuccess:async()=>{setFresh("");create.reset();await refresh();toast({title:"Link revoked"});},onError:e=>toast({title:"Could not revoke link",description:errMessage(e),variant:"destructive"})});
        }}>Revoke link</Button>
      </li>)}</ul>}
    {links.data?.length===0 && <p className="mt-3 text-sm text-muted-foreground">No private links yet. Create a coach link before switching hosting. For existing clients, select their existing account to preserve history.</p>}
  </Panel></div>;
}
