import { eq, sql } from "drizzle-orm";
import { db, usersTable, workspaceMembersTable, workspacesTable } from "@workspace/db";

// Absence of a membership means legacy TEAM data, never a personal workspace.
// A missing table is an error: do not silently bypass isolation before migration.
export async function workspaceId(userId: string): Promise<string> {
  const [row] = await db.select().from(workspaceMembersTable).where(eq(workspaceMembersTable.userId, userId));
  return row?.workspaceId ?? "team";
}
export async function sameWorkspace(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([workspaceId(a), workspaceId(b)]);
  return left === right;
}
export async function workspaceUserIds(userId: string): Promise<string[]> {
  const id = await workspaceId(userId);
  const rows = await db.select({ id: usersTable.id }).from(usersTable)
    .leftJoin(workspaceMembersTable, eq(workspaceMembersTable.userId, usersTable.id))
    .where(sql`coalesce(${workspaceMembersTable.workspaceId}, 'team') = ${id}`);
  return rows.map(r => r.id);
}
export async function workspaceInfo(userId: string) {
  const id = await workspaceId(userId);
  const [row] = await db.select().from(workspacesTable).where(eq(workspacesTable.id, id));
  if (!row) throw new Error("Workspace is not configured. Apply the workspace migration.");
  return { workspaceId: id, workspaceName: row.name };
}
