import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/workouts": "Workouts",
  "/programs": "All programs",
  "/my-programs": "My programs",
  "/progress": "Progress",
  "/clients": "Clients",
  "/settings": "Settings",
  "/join": "Join Team",
};

/** Resolve an in-app parent route. Never uses history.back. */
export function backTarget(loc: string): { href: string; label: string } | null {
  if (loc === "/" || loc === "") return null;
  if (/^\/programs\/[^/]+/.test(loc)) return { href: "/programs", label: "All programs" };
  return { href: "/", label: "Dashboard" };
}

export function pageTitle(loc: string): string {
  if (/^\/programs\/[^/]+/.test(loc)) return "Program";
  return TITLES[loc] ?? "Not Found";
}

export function useDocumentTitle() {
  const [loc] = useLocation();
  useEffect(() => {
    document.title = `${pageTitle(loc)} | Navy Powerlifting — Team Training`;
  }, [loc]);
}

export function BackNav() {
  const [loc] = useLocation();
  const target = backTarget(loc);
  const base = "inline-flex items-center gap-1 border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em]";
  if (!target) {
    return (
      <span aria-disabled="true" className={`${base} cursor-default border-border text-muted-foreground/50`} data-testid="button-back-disabled">
        <ChevronLeft className="h-3.5 w-3.5" /> Home
      </span>
    );
  }
  return (
    <Link
      href={target.href}
      className={`${base} border-primary/30 text-primary transition-colors hover:border-[#B4975A] hover:bg-[#B4975A]/10`}
      data-testid="button-back"
      aria-label={`Back to ${target.label}`}
    >
      <ChevronLeft className="h-3.5 w-3.5" /> Back to {target.label}
    </Link>
  );
}
