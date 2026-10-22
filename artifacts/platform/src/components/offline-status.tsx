import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "wouter";
import { useAuth, subscribeOffline, offlineRevision, offlineStatus, readDevice, syncSessions, retrySync, discardLocalSession, type OutboxEntry } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

export function OfflineStatus() {
  const { user } = useAuth();
  const revision = useSyncExternalStore(subscribeOffline, offlineRevision);
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [prepared, setPrepared] = useState(false);
  const [shellReady, setShellReady] = useState(false);
  const [shellError, setShellError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [actionError, setActionError] = useState("");
  const [working, setWorking] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const status = offlineStatus();
  useEffect(() => {
    let cancelled = false;
    void readDevice().then(data => {
      if (cancelled) return;
      setEntries(data.entries);
      setPrepared(!!data.workspace);
    }).catch(error => { if (!cancelled) setActionError(String(error)); });
    return () => { cancelled = true; };
  }, [revision, user?.id]);
  useEffect(() => {
    const onOnline = () => { setOnline(true); void syncSessions(); };
    const onOffline = () => setOnline(false);
    const onFocus = () => { void syncSessions(); };
    const onInstall = (event: Event) => { event.preventDefault(); setInstall(event as InstallPrompt); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeinstallprompt", onInstall);
    const timer = window.setInterval(() => { void syncSessions(); }, 30_000);
    void syncSessions();
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, updateViaCache: "none" })
        .then(registration => {
          if (registration.waiting) setUpdateReady(true);
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(true);
            });
          });
          return navigator.serviceWorker.ready;
        })
        .then(() => setShellReady(true))
        .catch(error => setShellError(`Offline app shell could not be installed: ${error instanceof Error ? error.message : String(error)}`));
    }
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, []);
  const pending = entries.filter(entry => entry.status === "pending");
  const failed = entries.filter(entry => entry.status === "error");
  async function action(run: () => Promise<unknown>) {
    setWorking(true); setActionError("");
    try { await run(); } catch (error) { setActionError(error instanceof Error ? error.message : String(error)); }
    finally { setWorking(false); }
  }
  const exportEntry = (entry: OutboxEntry) => {
    const localSaves = entries.filter(candidate => candidate.input.id === entry.input.id && candidate.status !== "synced");
    const url = URL.createObjectURL(new Blob([JSON.stringify({ sessionId: entry.input.id, queuedSaves: localSaves.map(candidate => ({ mutationId: candidate.mutationId, expected: candidate.expected, input: candidate.input })) }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `workout-${entry.input.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="border-b bg-card px-4 py-2 text-xs md:pl-64" aria-label="Offline and sync status" data-testid="offline-status">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" role="status">
        <strong>{online ? "Online" : "Offline"}</strong>
        {user && <span>{failed.length ? `${failed.length} sync error(s) · local copies retained` : pending.length ? `${pending.length} save(s) pending sync` : entries.length ? "Workout saves synced" : "No pending workout saves"}</span>}
        {user && <span className="text-muted-foreground">{prepared && shellReady ? "Ready to reopen offline on this device" : import.meta.env.DEV ? "Offline shell available in production builds only" : "Preparing offline access…"}</span>}
        {user && online && <button className="underline" disabled={working} onClick={() => void action(retrySync)} data-testid="button-retry-sync">Retry sync</button>}
        {install && <button className="font-semibold underline" onClick={() => void action(async () => { await install.prompt(); await install.userChoice; setInstall(null); })}>Install app</button>}
        <details className="relative">
          <summary className="cursor-pointer underline">Install & offline help</summary>
          <div className="absolute left-0 top-6 z-50 w-72 rounded border bg-card p-4 shadow-lg">
            <p>Install from your browser menu: Chrome/Edge → Install app; iPhone/iPad Safari → Share → Add to Home Screen → Open as Web App.</p>
            <p className="mt-2">Sign in online and open your workspace first. Wait for “Ready to reopen offline”. Use Save draft or Complete session to persist your inputs before closing. Reconnect and keep the app open to sync.</p>
            <p className="mt-2">Only workout logging is writable offline. Programs, chat, account changes, and deletion need a connection. Analytics update after server sync. Private snapshots remain on this device until sign-out; use a trusted device. Clearing browser data or uninstalling may erase unsynced work.</p>
          </div>
        </details>
      </div>
      {status.authRequired && <p role="alert" className="mt-1 text-amber-700 dark:text-amber-400">Sign-in expired or account changed. Local workouts are retained. <Link href="/sign-in" className="font-semibold underline">Sign in again to the same account</Link> to sync.</p>}
      {updateReady && <p className="mt-1">An app update is ready. Save your workout, then close all app tabs/windows and reopen online to apply it.</p>}
      {(actionError || status.storageError || shellError) && <p role="alert" className="mt-1 text-destructive">{actionError || status.storageError || shellError}</p>}
      {user && entries.length > 0 && <details className="mt-1">
        <summary className="cursor-pointer underline">Workout sync details</summary>
        <ul className="mt-2 space-y-1">
          {[...new Map(entries.map(entry => [entry.input.id, entry])).values()].map(entry => <li key={entry.input.id} className="flex flex-wrap gap-x-2" data-testid={`sync-session-${entry.input.id}`}>
            <span>{entry.input.name} · {entry.input.date}</span>
            <strong className={entry.status === "error" ? "text-destructive" : ""}>{entry.status === "pending" ? "Pending — saved on this device" : entry.status === "error" ? "Error — local copy retained" : "Synced to server"}</strong>
          </li>)}
        </ul>
      </details>}
      {failed.length > 0 && <details className="mt-2">
        <summary className="cursor-pointer font-semibold">Review sync errors — server data has not been overwritten</summary>
        <p className="my-2">Download the local copy before discarding. To compare, open the server session on another online device. Retry will never bypass a revision conflict.</p>
        {failed.map(entry => <div key={entry.mutationId} className="mb-2 rounded border p-3">
          <strong>{entry.input.name} · {entry.input.date}</strong>
          <p className="my-1 text-destructive">{entry.error}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => exportEntry(entry)}>Download all local saves</Button>
            <Button size="sm" variant="outline" disabled={working || !online} onClick={() => {
              if (confirm("Discard ALL unsynced saves for this session and reload the server copy? Download your local workout first. This cannot be undone.")) void action(() => discardLocalSession(entry.input.id));
            }}>Keep server copy & discard local</Button>
          </div>
        </div>)}
      </details>}
    </div>
  </section>;
}
