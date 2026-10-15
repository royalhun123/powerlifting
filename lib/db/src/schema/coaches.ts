import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

// Independent coaches, not coaching_links (which confer client management).
export const coachesTable = pgTable("app_coaches", {
  userId: text("user_id").primaryKey().references(() => usersTable.id),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const administrationTable = pgTable("app_administration", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
});
