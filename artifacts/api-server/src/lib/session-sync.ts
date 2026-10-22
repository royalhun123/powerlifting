import { createHash } from "node:crypto";

export type SyncReceipt = { fingerprint: string; updatedAt?: string };
export type SyncMetadata = Record<string, SyncReceipt>;
export function isDeletedSession(data: unknown): boolean {
  return !!data && typeof data === "object" && "_deleted" in data && data._deleted === true;
}

/** Receipts live alongside (not inside the public schema of) an existing session.
 * They survive later edits, so replaying an older acknowledged mutation cannot
 * undo a newer edit. No new tables or migration of historical rows is needed. */
export function sessionSyncDecision(
  previous: { updatedAt: string } | undefined,
  receipts: SyncMetadata,
  mutationId: string,
  expected: string,
  input: unknown,
): { replay: boolean; fingerprint: string } {
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const receipt = receipts[mutationId];
  if (receipt) {
    if (receipt.fingerprint !== fingerprint) throw Object.assign(new Error("This mutation ID was already used for different workout data."), { status: 409 });
    return { replay: true, fingerprint };
  }
  if (previous ? expected !== previous.updatedAt : expected !== "new") {
    throw Object.assign(new Error("Workout changed on the server (or was deleted). Your local copy is retained. Review the server version before saving again."), { status: 409 });
  }
  return { replay: false, fingerprint };
}
