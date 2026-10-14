import { date, jsonb, pgTable, text, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const trueMaxesTable = pgTable("training_true_maxes", {
  id: text("id").primaryKey(),
  athleteId: text("athlete_id").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  data: jsonb("data").notNull(),
}, t => [index("true_max_athlete_idx").on(t.athleteId)]);
export const insertTrueMaxSchema = createInsertSchema(trueMaxesTable);
export type TrueMaxRow = typeof trueMaxesTable.$inferSelect;
