import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { CheckCircle2, LogIn, XCircle } from "lucide-react";
import { useAcceptInvitation } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { errMessage, useInvalidateAll } from "@/hooks/use-platform";
import { INVITE_KEY } from "@/lib/pl";

export default function Join() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, login } = useAuth();
  const accept = useAcceptInvitation();
  const invalidate = useInvalidateAll();
  const fromUrl = new URLSearchParams(search).get("token") ?? "";
  const token = fromUrl || (typeof window !== "undefined" ? sessionStorage.getItem(INVITE_KEY) ?? "" : "");
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const tried = useRef(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (token) sessionStorage.setItem(INVITE_KEY, token);
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated || !token || tried.current || !confirmed) return;
    tried.current = true;
    accept.mutate(
      { data: { token } },
      {
        onSuccess: async () => {
          sessionStorage.removeItem(INVITE_KEY);
          await invalidate();
          setState("done");
        },
        onError: (e) => {
          sessionStorage.removeItem(INVITE_KEY);
          setState("error");
          setMsg(errMessage(e));
        },
      },
    );
  }, [isAuthenticated, token, accept, invalidate, confirmed]);

  return (
    <div className="chalk-grid flex min-h-[70vh] items-center justify-center">
      <div className="rise w-full max-w-md overflow-hidden rounded-md border bg-card">
        <div className="plate-stripe h-1.5" />
        <div className="p-8 text-center">
          <div className="font-num text-[11px] uppercase tracking-[0.22em] text-primary">Coach invitation</div>
          {!token ? (
            <>
              <h1 className="mt-2 font-display text-4xl font-bold uppercase">No token</h1>
              <p className="mt-2 text-sm text-muted-foreground">This link is missing its invitation token. Ask your coach to copy the link again.</p>
            </>
          ) : isLoading ? (
            <div className="mx-auto mt-6 h-8 w-40 animate-pulse rounded bg-muted" />
          ) : !isAuthenticated ? (
            <>
              <h1 className="mt-2 font-display text-4xl font-bold uppercase">Join your coach</h1>
              <p className="mt-2 text-sm text-muted-foreground">Accepting links you as this coach's client. Your coach will be able to see your full workout history, assign you blocks and leave feedback on sessions. Sign in to accept; the invitation is held in this tab and completes when you return.</p>
              <Button className="mt-6 w-full" onClick={login} data-testid="button-join-login"><LogIn className="mr-2 h-4 w-4" /> Sign in to accept</Button>
            </>
          ) : !confirmed ? (
            <>
              <h1 className="mt-2 font-display text-4xl font-bold uppercase">Grant coach access?</h1>
              <p className="mt-2 text-sm text-muted-foreground">Your coach will see your complete workout history, including set weights, RPE and notes, can assign you programs and leave feedback. They cannot log sessions for you.</p>
              <Button className="mt-6 w-full" onClick={() => setConfirmed(true)} data-testid="button-join-accept">Accept and link</Button>
              <Button variant="ghost" className="mt-2 w-full" onClick={() => { sessionStorage.removeItem(INVITE_KEY); setLocation("/"); }} data-testid="button-join-decline">Not now</Button>
            </>
          ) : state === "done" ? (
            <>
              <CheckCircle2 className="mx-auto mt-4 h-10 w-10" style={{ color: "hsl(var(--accessory))" }} />
              <h1 className="mt-2 font-display text-4xl font-bold uppercase">You are linked</h1>
              <p className="mt-2 text-sm text-muted-foreground">Your coach can now assign blocks and review your sessions. You keep logging your own training.</p>
              <Button className="mt-6 w-full" onClick={() => setLocation("/")} data-testid="button-join-continue">Go to dashboard</Button>
            </>
          ) : state === "error" ? (
            <>
              <XCircle className="mx-auto mt-4 h-10 w-10 text-destructive" />
              <h1 className="mt-2 font-display text-4xl font-bold uppercase">Invite not valid</h1>
              <p className="mt-2 text-sm text-muted-foreground" data-testid="text-join-error">{msg || "It may have expired, been revoked, or already been used."}</p>
              <Link href="/" className="mt-6 inline-block text-sm text-primary underline" data-testid="link-join-home">Back to dashboard</Link>
            </>
          ) : (
            <>
              <h1 className="mt-2 font-display text-4xl font-bold uppercase">Accepting…</h1>
              <div className="mx-auto mt-4 h-1 w-40 overflow-hidden rounded bg-muted"><div className="h-full w-1/2 animate-pulse bg-primary" /></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
