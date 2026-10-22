import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth, subscribeOffline, offlineRevision, offlineStatus, readDevice, syncSessions } from "@workspace/replit-auth-web";

export function OfflineStatus() {
  const { user } = useAuth();
  const revision = useSyncExternalStore(subscribeOffline, offlineRevision);
  const [synced, setSynced] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const status = offlineStatus();
  useEffect(() => {
    let cancelled = false;
    setSynced(false);
    void readDevice().then(data => {
      if (!cancelled) setSynced(!data.entries.some(entry => entry.status !== "synced") && !(data.recoveries?.length));
    }).catch(() => { if (!cancelled) setSynced(false); });
    return () => { cancelled = true; };
  }, [revision, user?.id]);
  useEffect(() => {
    const sync = () => { void syncSessions(); };
    const onOnline = () => { setOnline(true); sync(); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", sync);
    const timer = window.setInterval(sync, 30_000);
    sync();
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, updateViaCache: "none" }).catch(() => {
        // Offline readiness is shown in Settings; this does not change server sync.
      });
    }
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", sync);
    };
  }, []);
  return <section className="border-b bg-card px-4 py-2 text-xs md:pl-64" aria-label="Connection and sync status" data-testid="offline-status">
    <div className="mx-auto flex max-w-7xl items-center gap-3" role="status">
      <strong>{online ? "Online" : "Offline"}</strong>
      {user && <span>{synced && !status.storageError && !status.authRequired ? "Synced" : "Not synced"}</span>}
    </div>
  </section>;
}
