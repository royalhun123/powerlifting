import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Anchor } from "lucide-react";
import { BackNav, pageTitle, useDocumentTitle } from "@/components/back-nav";
import { BarChart3, BookOpen, ClipboardList, Dumbbell, ShieldCheck, LayoutGrid, LogIn, LogOut, Menu, Settings, Users, X } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-platform";
import { daysUntil, initials } from "@/lib/pl";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/workouts", label: "Workouts", icon: Dumbbell },
  { href: "/my-programs", label: "My programs", icon: ClipboardList },
  { href: "/my-training", label: "My training", icon: BookOpen },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/coaches", label: "Coaches", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const [loc] = useLocation();
  const { data } = useWorkspace();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.filter(item => (data?.isCoach || !["/my-training","/clients"].includes(item.href)) && (item.href !== "/coaches" || (!!data?.isCoach && !!data?.isAdmin))).map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? loc === "/" : loc.startsWith(href) || (href === "/my-programs" && !!data?.isCoach && loc.startsWith("/programs"));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            data-testid={`link-nav-${label.toLowerCase()}`}
            className={cn(
              "group relative flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm transition-colors",
              active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <span className={cn("absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-sidebar-primary transition-transform", active ? "scale-y-100" : "scale-y-0")} />
            <Icon className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-[0.1em]">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const { data } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [loc] = useLocation();
  useDocumentTitle();
  const meet = data?.profile.meetDate ? daysUntil(data.profile.meetDate) : null;
  const name = data?.profile.name || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Lifter";

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="gold-rule h-1" />
      <Link href="/" className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5" data-testid="link-brand">
        <div className="flex h-10 w-10 items-center justify-center border border-sidebar-primary text-sidebar-primary">
          <Anchor className="h-5 w-5" />
        </div>
        <div>
          <div className="font-display text-xl font-bold leading-none tracking-wide text-white/95">Navy Powerlifting</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-sidebar-primary">Team Training</div>
        </div>
      </Link>
      <div className="h-4" />
      <div className="flex-1 px-3">
        <NavLinks onNavigate={() => setOpen(false)} />
      </div>
      {meet !== null && meet >= 0 && (
        <div className="mx-3 mb-3 rounded-sm border border-sidebar-border p-3">
          <div className="font-num text-[9px] uppercase tracking-[0.25em] text-sidebar-foreground/50">Meet day in</div>
          <div className="font-display text-3xl font-bold leading-none text-sidebar-primary" data-testid="text-sidebar-meet">
            {meet}
            <span className="ml-1 text-sm text-sidebar-foreground/60">days</span>
          </div>
        </div>
      )}
      <div className="border-t border-sidebar-border p-3">
        {isAuthenticated ? (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-sidebar-accent font-num text-xs">{initials(name)}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm" data-testid="text-user-name">{name}</div>
              <div className="truncate font-num text-[10px] text-sidebar-foreground/50">{user?.email ?? "signed in"}</div>
            </div>
            <button onClick={logout} className="rounded-sm p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground" data-testid="button-logout" aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Button onClick={login} disabled={isLoading} className="w-full bg-sidebar-primary text-sidebar-primary-foreground" data-testid="button-login">
            <LogIn className="mr-2 h-4 w-4" /> Sign in
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-background md:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 md:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-background/90 px-4 py-2.5 backdrop-blur shadow-[inset_0_-2px_0_#B4975A] md:px-8">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-3 md:w-auto">
          <button className="rounded-sm p-1.5 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu" data-testid="button-menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="flex items-center gap-1.5 whitespace-nowrap font-display text-lg font-bold text-primary md:hidden"><Anchor className="h-4 w-4 text-[#B4975A]" />Navy Powerlifting</span>
          <BackNav />
          <span className="hidden font-display text-lg text-primary sm:inline" data-testid="text-page-title">{pageTitle(loc)}</span>
          {data?.demo && (
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 font-num text-[10px] uppercase tracking-widest text-primary" data-testid="badge-demo">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> Demo data · read-only
            </span>
          )}
        </div>
        {!isAuthenticated && !isLoading && (
          <Button size="sm" onClick={login} data-testid="button-header-login">
            <LogIn className="mr-2 h-4 w-4" /> Sign in to train
          </Button>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-[11px] text-muted-foreground md:px-8">Navy Powerlifting team training tool. USNA-inspired design; not an official U.S. Naval Academy website or endorsement.</footer>
    </div>
  );
}
