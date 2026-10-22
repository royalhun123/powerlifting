import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, cacheWorkspace, cachedWorkspace, subscribeOffline, offlineRevision } from "@workspace/replit-auth-web";
import { getGetWorkspaceQueryKey, getWorkspace } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export function useWorkspace() {
  const { user, isLoading } = useAuth();
  const revision = useSyncExternalStore(subscribeOffline, offlineRevision);
  const qc = useQueryClient();
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void cachedWorkspace().then(workspace => {
      if (!cancelled && workspace?.profile.id === user.id) qc.setQueryData(getGetWorkspaceQueryKey(), workspace);
    }).catch(() => undefined); // Storage error is shown by OfflineStatus.
    return () => { cancelled = true; };
  }, [revision, user?.id, qc]);
  return useQuery({
    queryKey: getGetWorkspaceQueryKey(),
    enabled: !isLoading && !!user,
    networkMode: "always",
    queryFn: async () => {
      if (!navigator.onLine) {
        const cached = await cachedWorkspace();
        if (!cached) throw new Error("Connect online once to prepare this account for offline training.");
        return cached;
      }
      let workspace;
      const requestedAt = Date.now();
      try { workspace = await getWorkspace(); }
      catch (error) {
        const cached = await cachedWorkspace();
        if (cached) return cached;
        throw error;
      }
      if (workspace.demo) {
        const cached = await cachedWorkspace();
        if (cached) return cached;
        throw new Error("Your sign-in expired. Sign in again to prepare offline training.");
      }
      if (workspace.profile.id !== user?.id) throw new Error("The signed-in account changed. Reload before viewing this workspace.");
      // Do not hide storage or workspace-boundary errors as network failures.
      return cacheWorkspace(workspace, requestedAt);
    },
    staleTime: 20_000, refetchInterval: 60_000, refetchOnWindowFocus: true, retry: 1,
  });
}

/** Invalidate workspace + every analytics query after any mutation. */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() }),
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/analytics") }),
    ]);
  }, [qc]);
}

/** Only explicit durable workout saves may proceed without a network. */
export function useMutationGuard(allowOffline = false) {
  const { isAuthenticated, login } = useAuth();
  const { toast } = useToast();
  return useCallback(() => {
    if (!allowOffline && !navigator.onLine) {
      toast({ title: "Online connection required", description: "Only workout draft/completed saves are supported offline. Reconnect before changing programs, measurements, or account settings." });
      return false;
    }
    if (isAuthenticated) return true;
    toast({ title: "Sign in to save", description: "You are viewing demo data. Changes are never saved without an account." });
    login();
    return false;
  }, [isAuthenticated, login, toast, allowOffline]);
}

export function errMessage(e: unknown): string {
  if (!e) return "Something went wrong";
  const anyE = e as { data?: { error?: string; message?: string }; message?: string };
  return anyE.data?.error ?? anyE.data?.message ?? anyE.message ?? "Something went wrong";
}
