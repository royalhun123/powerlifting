import { useState } from "react";
import { Link } from "wouter";
import { useRegisterLifter } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Panel } from "@/components/common";
import { errMessage } from "@/hooks/use-platform";

export default function SignUp() {
  const register=useRegisterLifter();
  const [name,setName]=useState(""),[username,setUsername]=useState("");
  const [password,setPassword]=useState(""),[confirm,setConfirm]=useState("");
  const valid=/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(username.trim()) && password.length>=12 && password.length<=128 && password===confirm;
  return <div className="mx-auto max-w-xl py-8">
    <PageHeader kicker="Navy Powerlifting" title="Create account" />
    <Panel title="Start training as a lifter">
      <p className="mb-5 text-sm text-muted-foreground">No invitation needed. Join the team workspace as an independent lifter, use its shared program library, and create or join a lifting group. Your workout logs remain private unless you join a group; your workspace administrator has read-only oversight. Programs you create are shared within this workspace.</p>
      <form className="space-y-4" onSubmit={e=>{
        e.preventDefault();if(!valid||register.isPending)return;
        register.mutate({data:{username:username.trim(),password,...(name.trim()?{name:name.trim()}:{} )}},
          {onSuccess:()=>{localStorage.removeItem("navy-pending-logout");window.location.replace(import.meta.env.BASE_URL);}});
      }}>
        <label className="grid gap-1 text-sm">Name (optional)<Input value={name} onChange={e=>setName(e.target.value)} maxLength={100} autoComplete="name" /></label>
        <label className="grid gap-1 text-sm">Username<Input required value={username} onChange={e=>setUsername(e.target.value)} maxLength={32} autoComplete="username" autoCapitalize="none" spellCheck={false} aria-describedby="username-help" /></label>
        <p id="username-help" className="text-xs text-muted-foreground">3–32 characters: letters, numbers, dots, underscores or dashes. Start with a letter or number. Usernames are unique across all workspaces.</p>
        <label className="grid gap-1 text-sm">Password<Input required type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={12} maxLength={128} autoComplete="new-password" /></label>
        <p className="text-xs text-muted-foreground">Use at least 12 characters.</p>
        <label className="grid gap-1 text-sm">Confirm password<Input required type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} maxLength={128} autoComplete="new-password" /></label>
        {confirm && confirm!==password && <p role="alert" className="text-sm text-destructive">Passwords do not match.</p>}
        {register.isError && <p role="alert" className="text-sm text-destructive">{errMessage(register.error)}</p>}
        <Button type="submit" disabled={!valid||register.isPending}>{register.isPending?"Creating account…":"Create account"}</Button>
      </form>
      <p className="mt-5 text-sm">Already have an account? <Link href="/sign-in" className="font-semibold underline">Sign in</Link></p>
      <p className="mt-3 text-xs text-muted-foreground">Personal-workspace access still requires an invitation. Keep your password safe; there is no email password reset.</p>
    </Panel>
  </div>;
}
