import type { ReactNode } from "react";
import { AlertTriangle, LogIn, RotateCw } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LIFT_LABEL, LIFT_VAR } from "@/lib/pl";
import { cn } from "@/lib/utils";

export function PageHeader({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="rise mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="font-num text-[11px] uppercase tracking-[0.22em] text-primary">{kicker}</div>
        <h1 className="font-display text-4xl font-700 uppercase leading-none md:text-5xl" style={{ fontWeight: 700 }}>
          {title}
        </h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rise rounded-md border border-card-border bg-card", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 border-b border-card-border px-4 py-2.5">
          <h2 className="font-display text-lg font-semibold uppercase tracking-wide">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function LiftTag({ lift, className }: { lift: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-num text-[10px] uppercase tracking-widest text-muted-foreground", className)}>
      <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: LIFT_VAR[lift] ?? LIFT_VAR.accessory }} />
      {LIFT_LABEL[lift] ?? lift}
    </span>
  );
}

export function LoadingPage() {
  return (
    <div className="space-y-6" data-testid="status-loading">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-72" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="chalk-grid flex min-h-[50vh] flex-col items-center justify-center rounded-md border border-dashed border-destructive/40 p-8 text-center" data-testid="status-error">
      <AlertTriangle className="mb-3 h-8 w-8 text-destructive" />
      <h2 className="font-display text-2xl font-semibold uppercase">No lift. Red lights.</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message ?? "The platform could not load your data."}</p>
      {onRetry && (
        <Button className="mt-4" variant="outline" onClick={onRetry} data-testid="button-retry">
          <RotateCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="chalk-grid flex flex-col items-center justify-center rounded-md border border-dashed p-10 text-center" data-testid="status-empty">
      <div className="mb-4 flex items-end gap-1">
        <span className="h-10 w-2.5 rounded-sm" style={{ background: LIFT_VAR.squat }} />
        <span className="h-8 w-2.5 rounded-sm" style={{ background: LIFT_VAR.bench }} />
        <span className="h-6 w-2.5 rounded-sm" style={{ background: LIFT_VAR.deadlift }} />
        <span className="mx-1 h-1 w-16 self-center rounded bg-foreground/60" />
        <span className="h-6 w-2.5 rounded-sm" style={{ background: LIFT_VAR.deadlift }} />
        <span className="h-8 w-2.5 rounded-sm" style={{ background: LIFT_VAR.bench }} />
        <span className="h-10 w-2.5 rounded-sm" style={{ background: LIFT_VAR.squat }} />
      </div>
      <h3 className="font-display text-xl font-semibold uppercase">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SignInCallout({ text }: { text: string }) {
  const { login } = useAuth();
  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
      <p className="text-sm">{text}</p>
      <Button size="sm" onClick={login} data-testid="button-signin-callout">
        <LogIn className="mr-2 h-4 w-4" /> Sign in
      </Button>
    </div>
  );
}

export function Stat({ label, value, unit, sub, accent }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; accent?: string }) {
  return (
    <div className="relative overflow-hidden rounded-md border border-card-border bg-card p-4">
      {accent && <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />}
      <div className="font-num text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-display text-4xl font-bold leading-none">{value}</span>
        {unit && <span className="font-num text-xs text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
