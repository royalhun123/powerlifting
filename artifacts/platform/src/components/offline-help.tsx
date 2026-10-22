import { useEffect, useState } from "react";
import { Panel } from "@/components/common";
import { readDevice } from "@workspace/replit-auth-web";

export function OfflineHelp() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if ("serviceWorker" in navigator) {
      void Promise.all([navigator.serviceWorker.ready, readDevice()])
        .then(([, device]) => { if (!cancelled) setReady(!!device.workspace); })
        .catch(() => { if (!cancelled) setReady(false); });
    }
    return () => { cancelled = true; };
  }, []);
  return <Panel title="Install & offline help">
    <div className="space-y-4 text-sm" data-testid="offline-help">
      <section><h3 className="font-semibold">Install on your phone or computer</h3>
        <p>iPhone/iPad: open the site in Safari, then Share → Add to Home Screen → Open as Web App. Chrome/Edge: choose Install app from the browser menu.</p>
      </section>
      <section><h3 className="font-semibold">Prepare for offline workouts</h3>
        <p>Sign in online and load your workouts first. Use a trusted device.</p>
        <p className="mt-1 font-medium">{ready ? "Ready to reopen offline on this device." : import.meta.env.DEV ? "Offline installation is available on the published site." : "Preparing offline access. Stay online until ready."}</p>
      </section>
      <section><h3 className="font-semibold">Your workouts sync to the server</h3>
        <p>Drafts save automatically as you type. Offline changes are held temporarily on this device and sent to the server when you reconnect with the app open. Use Complete session when finished. The top bar shows Synced only when no workout saves are waiting.</p>
        <p className="mt-2">If it stays Not synced, keep the app online, finish any incomplete fields, and check that you are signed in to the same account. Changes made on another device may need reconciliation; they will not be silently overwritten.</p>
      </section>
      <section><h3 className="font-semibold">Before closing or updating</h3>
        <p>Wait for Synced whenever possible. Do not sign out, uninstall, or clear browser storage while changes are unsynced. To apply an app update, close all app tabs/windows and reopen online after syncing.</p>
        <p className="mt-2">Workout logging works offline. Programs, chat, account changes, deletion, and updated analytics require internet.</p>
      </section>
    </div>
  </Panel>;
}
