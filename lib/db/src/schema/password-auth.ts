import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const credentialsTable = pgTable("password_credentials", {
  userId: text("user_id").primaryKey().references(() => usersTable.id),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash"),
  version: integer("version").notNull().default(0),
});

export const passwordSetupsTable = pgTable("password_setups", {
  userId: text("user_id").primaryKey().references(() => usersTable.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const authLimitsTable = pgTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, t => [index("auth_limits_expiry_idx").on(t.expiresAt)]);
