import { useCallback, useEffect, useState } from 'react';
import type { AuthUser } from '@workspace/api-client-react';
import { cachedUser, forgetDevice, readDevice, rememberUser, requireAuthentication } from './offline';

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

function getBasePath() {
  return import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
}

// All useAuth consumers share a single identity check. Never race multiple users'
// private snapshots into the same React Query cache.
let identity: Promise<AuthUser | null> | undefined;
async function resolveIdentity(): Promise<AuthUser | null> {
  if (localStorage.getItem("navy-pending-logout")) {
    if (!navigator.onLine) return null;
    const response = await fetch("/api/auth/device-logout", { method: "POST", credentials: "include" });
    if (!response.ok) throw new Error("Connect online to finish signing out.");
    localStorage.removeItem("navy-pending-logout");
  }
  try {
    const response = await fetch('/api/auth/user', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { user } = await response.json() as { user: AuthUser | null };
    if (user) {
      await rememberUser(user).catch(() => undefined); // Online auth still works; storage failure is visibly reported.
      return user;
    }
    requireAuthentication();
  } catch {
    // Cached identity unlocks only this device's previously authenticated
    // snapshot. It is NEVER an API credential or permission to sync.
  }
  return cachedUser().catch(() => null);
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (identity ??= resolveIdentity())
      .then((resolvedUser) => {
        if (!cancelled) {
          setUser(resolvedUser);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    const base = getBasePath();
    window.location.href = `/api/login?returnTo=${encodeURIComponent(base)}`;
  }, []);

  const logout = useCallback(async () => {
    const device = await readDevice().catch(() => null);
    const pending = device?.entries.filter(entry => entry.status !== "synced").length ?? 0;
    if (!window.confirm(pending
      ? `${pending} unsynced workout save(s) for this account will be permanently removed. All accounts' private device data will be erased. Cancel and sync first to keep unsynced work. Continue?`
      : "Sign out and erase all accounts' private training data and any unsynced saves on this device?")) return;
    localStorage.setItem("navy-pending-logout", "1");
    try { await forgetDevice(); }
    catch (error) { localStorage.removeItem("navy-pending-logout"); window.alert(error instanceof Error ? error.message : "Unable to clear device storage."); return; }
    if (navigator.onLine) {
      try {
        const response = await fetch("/api/auth/device-logout", { method: "POST", credentials: "include" });
        if (response.ok) localStorage.removeItem("navy-pending-logout");
      } catch { /* Device is already erased; retry server revocation on reopen. */ }
    }
    const base = getBasePath();
    window.location.href = `${base.replace(/\/$/, "")}/sign-in`;
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
