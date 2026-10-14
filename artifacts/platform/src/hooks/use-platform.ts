import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { getGetWorkspaceQueryKey, useGetWorkspace } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export function useWorkspace() {
  return useGetWorkspace({
    query: { queryKey: getGetWorkspaceQueryKey(), staleTime: 20_000, refetchInterval: 60_000, refetchOnWindowFocus: true },
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

/** Returns a guard: true when signed in, otherwise prompts sign-in and returns false. Never fakes a save. */
export function useMutationGuard() {
  const { isAuthenticated, login } = useAuth();
  const { toast } = useToast();
  return useCallback(() => {
    if (isAuthenticated) return true;
    toast({ title: "Sign in to save", description: "You are viewing demo data. Changes are never saved without an account." });
    login();
    return false;
  }, [isAuthenticated, login, toast]);
}

export function errMessage(e: unknown): string {
  if (!e) return "Something went wrong";
  const anyE = e as { data?: { error?: string; message?: string }; message?: string };
  return anyE.data?.error ?? anyE.data?.message ?? anyE.message ?? "Something went wrong";
}
