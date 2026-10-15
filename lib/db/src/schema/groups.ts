import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { workspacesTable } from "./workspaces";

export const groupsTable = pgTable("lifting_groups", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id),
  leaderId: text("leader_id").notNull().unique().references(() => usersTable.id),
  name: text("name").notNull(),
});
export const groupMembersTable = pgTable("lifting_group_members", {
  userId: text("user_id").primaryKey().references(() => usersTable.id),
  groupId: text("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
});
export const groupInvitesTable = pgTable("lifting_group_invites", {
  tokenHash: text("token_hash").primaryKey(),
  groupId: text("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedBy: text("used_by").references(() => usersTable.id),
});
