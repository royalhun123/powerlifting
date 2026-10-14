import { date, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const bodyweightsTable = pgTable("training_bodyweights", {
  athleteId: text("athlete_id").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  timeOfDay: text("time_of_day").notNull().default("unspecified"),
  data: jsonb("data").notNull(),
}, t => [primaryKey({ columns: [t.athleteId, t.date, t.timeOfDay] })]);
export const insertBodyweightSchema = createInsertSchema(bodyweightsTable);
export type BodyweightRow = typeof bodyweightsTable.$inferSelect;
export type InsertBodyweight = typeof bodyweightsTable.$inferInsert;
