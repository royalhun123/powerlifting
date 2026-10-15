import { pgTable, text } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const workspacesTable = pgTable("app_workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});
export const workspaceMembersTable = pgTable("app_workspace_members", {
  userId: text("user_id").primaryKey().references(() => usersTable.id),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id),
});
