import type { AuthUser, Session, SessionInput, Workspace } from "@workspace/api-client-react";

export type OutboxEntry = {
  mutationId: string;
  localRevision: string;
  serverRevision?: string;
  syncedAt?: number;
  input: SessionInput & { id: string };
  expected: string;
  status: "pending" | "synced" | "error";
  error?: string;
  saved: Session;
};
type DeviceData = { user?: AuthUser; workspace?: Workspace; entries: OutboxEntry[] };
const ACTIVE_KEY = "navy-offline-user-v1";
let activeId: string | null = null;
let revision = 0;
let storageError = "";
try { activeId = localStorage.getItem(ACTIVE_KEY); }
catch { storageError = "Browser device storage is blocked. Enable site storage to use offline training."; }
let authRequired = false;
const listeners = new Set<() => void>();
export const subscribeOffline = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const offlineRevision = () => revision;
export function offlineStatus() { return { storageError, authRequired, activeId }; }
function notify() { revision++; listeners.forEach(fn => fn()); }
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("navy-offline-v1") : null;
channel?.addEventListener("message", () => notify());
function changed() { notify(); channel?.postMessage("changed"); }
window.addEventListener("storage", event => {
  if (event.key === ACTIVE_KEY) window.location.reload();
});

let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("navy-training-offline-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("users");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Device storage unavailable. Offline saves are not safe on this browser."));
    request.onblocked = () => reject(new Error("Close other Navy training tabs to enable device storage."));
  });
}
async function update<T>(id: string, edit: (data: DeviceData) => T, write = true): Promise<T> {
  try {
    const database = await db();
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction("users", write ? "readwrite" : "readonly");
      const store = transaction.objectStore("users");
      const request = store.get(id);
      let result: T;
      request.onsuccess = () => {
        try {
          if (write && (localStorage.getItem(ACTIVE_KEY) !== id || localStorage.getItem("navy-pending-logout"))) throw new Error("Account changed or signed out. Reload before saving private data.");
          const data: DeviceData = request.result ?? { entries: [] };
          result = edit(data);
          if (write) store.put(data, id);
        } catch (error) { transaction.abort(); reject(error); }
      };
      transaction.oncomplete = () => { if (write) { storageError = ""; changed(); } resolve(result); };
      transaction.onerror = () => reject(new Error("Unable to save to this device (storage full or disabled). Do not close this workout."));
      transaction.onabort = () => reject(new Error("Device save was interrupted. Do not close this workout."));
    });
  } catch (error) {
    storageError = error instanceof Error ? error.message : "Device storage failed.";
    notify();
    throw error;
  }
}
export async function cachedUser(): Promise<AuthUser | null> {
  return activeId ? update(activeId, data => data.user ?? null, false) : null;
}
export async function rememberUser(user: AuthUser) {
  if (activeId !== user.id) {
    activeId = user.id;
    localStorage.setItem(ACTIVE_KEY, user.id);
  }
  authRequired = false;
  await update(user.id, data => { data.user = user; });
}
export function requireAuthentication() { authRequired = !!activeId; notify(); }
export async function forgetDevice() {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("users", "readwrite");
    tx.objectStore("users").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error("Could not clear private device data. Close the app and clear site storage."));
  });
  activeId = null;
  localStorage.removeItem(ACTIVE_KEY);
  changed();
}
export async function readDevice() {
  return activeId ? update(activeId, data => data, false) : { entries: [] } as DeviceData;
}
export function mergeWorkspace(data: DeviceData): Workspace | undefined {
  if (!data.workspace) return undefined;
  const sessions = new Map(data.workspace.sessions.map(session => [session.id, session]));
  for (const entry of data.entries) if (entry.status !== "synced") sessions.set(entry.saved.id, entry.saved);
  return { ...data.workspace, sessions: [...sessions.values()] };
}
export async function cacheWorkspace(workspace: Workspace, requestedAt = Date.now()) {
  const id = activeId;
  if (!id || workspace.demo || workspace.profile.id !== id) throw new Error("Workspace does not match the signed-in account.");
  return update(id, data => {
    if (data.workspace && data.workspace.workspaceId !== workspace.workspaceId) {
      // Never attach an old-workspace queue to a new-workspace snapshot.
      if (data.entries.some(entry => entry.status !== "synced")) throw new Error("Workspace changed. Pending workouts remain on this device for the original workspace. Contact your administrator before clearing them.");
      data.entries = [];
    }
    // A GET started before an acknowledgement may finish after it. Preserve
    // commits newer than that GET, without reviving genuinely deleted sessions
    // from a later request.
    const sessions = new Map(workspace.sessions.map(session => [session.id, session]));
    for (const entry of data.entries) {
      if (entry.status === "synced" && (entry.syncedAt ?? 0) >= requestedAt) sessions.set(entry.saved.id, entry.saved);
    }
    data.workspace = { ...workspace, sessions: [...sessions.values()] };
    return mergeWorkspace(data)!;
  });
}
export async function cachedWorkspace() { return mergeWorkspace(await readDevice()); }
export async function queueSession(input: SessionInput, expected: string): Promise<Session> {
  const id = activeId;
  if (!id) throw new Error("Sign in online before saving a workout on this device.");
  const sessionId = input.id ?? crypto.randomUUID();
  const sessionInput = { ...input, id: sessionId };
  const saved = await update(id, data => {
    if (!data.workspace) throw new Error("Load your workspace online once before using offline workouts.");
    const prior = data.entries.filter(entry => entry.input.id === sessionId && entry.status !== "synced");
    if (prior.some(entry => entry.status === "error")) throw new Error("Resolve this session's sync error before saving another revision. Your current inputs remain open.");
    const previous = [...prior].reverse()[0]?.saved ?? data.workspace.sessions.find(session => session.id === sessionId);
    const saved: Session = {
      ...sessionInput, athleteId: id, athleteName: data.workspace.profile.name,
      coachFeedback: previous?.coachFeedback ?? "", discussions: previous?.discussions,
      volume: input.sets.filter(set => set.completed).reduce((total, set) => total + set.weight * set.reps, 0),
      updatedAt: new Date(Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0)).toISOString(),
    };
    // Every explicit save is an immutable durable command. A later command waits
    // for the preceding receipt and then uses its exact server revision.
    const receipt = data.entries.find(entry => entry.input.id === sessionId && entry.localRevision === expected && entry.status === "synced");
    data.entries.push({ mutationId: crypto.randomUUID(), localRevision: saved.updatedAt, input: sessionInput, expected: receipt?.serverRevision ?? receipt?.saved.updatedAt ?? expected, status: "pending", saved });
    return saved;
  });
  void navigator.storage?.persist?.().catch(() => false);
  void syncSessions();
  return saved;
}

let syncing: Promise<void> | undefined;
export function syncSessions(): Promise<void> {
  if (syncing) return syncing;
  const run = async () => {
    if (!activeId || !navigator.onLine) return;
    const id = activeId;
    let auth: Response;
    try { auth = await fetch("/api/auth/user", { credentials: "include", cache: "no-store" }); }
    catch { return; }
    if (!auth.ok) { requireAuthentication(); return; }
    const { user } = await auth.json() as { user: AuthUser | null };
    if (!user || user.id !== id) { requireAuthentication(); return; }
    authRequired = false;
    notify();
    // Validate current membership before sending private data from a cached workspace.
    let fresh: Response;
    try { fresh = await fetch("/api/workspace", { credentials: "include", cache: "no-store" }); }
    catch { return; }
    if (!fresh.ok) { if (fresh.status === 401 || fresh.status === 403) requireAuthentication(); return; }
    const workspace = await fresh.json() as Workspace;
    if (workspace.demo) { requireAuthentication(); return; }
    const local = await readDevice();
    if (workspace.profile.id !== id || workspace.workspaceId !== local.workspace?.workspaceId) {
      await update(id, data => { for (const entry of data.entries) if (entry.status === "pending") { entry.status = "error"; entry.error = "Workspace membership changed. Original workout retained; no data sent."; } });
      return;
    }
    while (activeId === id && navigator.onLine) {
      const device = await readDevice();
      const entry = device.entries.find(candidate => candidate.status === "pending" &&
        !device.entries.some(earlier => earlier.input.id === candidate.input.id && earlier.status === "error"));
      if (!entry) break;
      let response: Response;
      try {
        response = await fetch("/api/sessions", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json", "X-Session-Sync": "1", "X-Mutation-Id": entry.mutationId, "X-Expected-Updated-At": entry.expected, "X-Workspace-Id": workspace.workspaceId ?? "team" },
          body: JSON.stringify(entry.input),
        });
      } catch { break; } // Ambiguous outcome: keep the SAME mutation ID for retry.
      if (response.status === 401) { requireAuthentication(); break; }
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        await update(id, data => {
          const current = data.entries.find(candidate => candidate.mutationId === entry.mutationId);
          if (current) { current.status = "error"; current.error = body.error ?? `Sync failed (${response.status}). Local workout retained.`; }
        });
        if (response.status === 403) requireAuthentication();
        continue;
      }
      const saved = await response.json() as Session;
      const serverRevision = response.headers.get("X-Acknowledged-Updated-At") ?? saved.updatedAt;
      await update(id, data => {
        const index = data.entries.findIndex(candidate => candidate.mutationId === entry.mutationId);
        if (index < 0) return;
        data.entries[index] = { ...data.entries[index], saved, serverRevision, syncedAt: Date.now(), status: "synced" };
        const next = data.entries.slice(index + 1).find(candidate => candidate.input.id === saved.id && candidate.status === "pending");
        if (next) next.expected = serverRevision;
        if (data.workspace) data.workspace.sessions = [...data.workspace.sessions.filter(session => session.id !== saved.id), saved];
        // Retain one receipt per session for visible synced state; server holds
        // the full idempotency ledger. Never prune pending or failed commands.
        data.entries = data.entries.filter((candidate, i) => candidate.status !== "synced" || candidate.input.id !== saved.id || i === index);
      });
    }
  };
  const operation: Promise<void> = Promise.resolve(navigator.locks ? navigator.locks.request("navy-session-sync", run) : run()).then(() => undefined);
  syncing = operation
    .catch(error => { storageError = error instanceof Error ? error.message : "Sync failed. Local data retained."; notify(); })
    .finally(() => { syncing = undefined; });
  return syncing!;
}
export async function retrySync() {
  if (!activeId) return;
  await update(activeId, data => {
    for (const entry of data.entries) if (entry.status === "error") { entry.status = "pending"; entry.error = undefined; }
  });
  await syncSessions();
}
/** Explicit discard only; never silently replace either copy in a conflict. */
export async function discardLocalSession(sessionId: string) {
  if (!activeId) return;
  const id = activeId;
  if (!navigator.onLine) throw new Error("Connect online to review the server copy before discarding.");
  const response = await fetch("/api/workspace", { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load server workouts. Local copy retained.");
  const workspace = await response.json() as Workspace;
  await update(id, data => {
    if (workspace.demo || workspace.profile.id !== id || workspace.workspaceId !== data.workspace?.workspaceId) throw new Error("Sign in to the original account and workspace before discarding.");
    data.workspace = workspace;
    data.entries = data.entries.filter(entry => entry.input.id !== sessionId);
  });
}
