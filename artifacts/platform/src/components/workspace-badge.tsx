import { Building2, User } from "lucide-react";
import { useWorkspace } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";

export function useWorkspaceScope() {
  const { data } = useWorkspace();
  const name = data?.workspaceName?.trim();
  const isTeam = !data?.workspaceId || data.workspaceId === "team";
  return { name: name || (isTeam ? "Navy Powerlifting team" : "Personal coaching"), isTeam, loaded: !!data };
}

export function WorkspaceBadge({ variant = "light", className }: { variant?: "light" | "sidebar"; className?: string }) {
  const { name, isTeam, loaded } = useWorkspaceScope();
  if (!loaded) return null;
  const Icon = isTeam ? Building2 : User;
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1.5 border px-2 py-0.5 font-num text-[10px] uppercase tracking-widest",
        variant === "sidebar" ? "border-sidebar-primary/50 text-sidebar-primary" : "border-[#B4975A]/60 text-primary",
        className,
      )}
      title={`Current workspace: ${name}`}
      data-testid="badge-workspace"
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="shrink-0 opacity-70">{isTeam ? "Team" : "Personal"}</span>
      <span className="truncate normal-case tracking-normal" data-testid="text-workspace-name">{name}</span>
    </span>
  );
}
