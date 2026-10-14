import { pgTable, text, jsonb, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const profilesTable = pgTable("training_profiles", {
  userId: text("user_id").primaryKey(),
  data: jsonb("data").notNull(),
});
export const programsTable = pgTable("training_programs", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  data: jsonb("data").notNull(),
}, t => [index("program_owner_idx").on(t.ownerId)]);
export const assignmentsTable = pgTable("training_assignments", {
  id: text("id").primaryKey(),
  coachId: text("coach_id").notNull(),
  athleteId: text("athlete_id").notNull(),
  data: jsonb("data").notNull(),
}, t => [index("assignment_athlete_idx").on(t.athleteId), index("assignment_coach_idx").on(t.coachId)]);
export const workoutsTable = pgTable("training_sessions", {
  id: text("id").primaryKey(),
  athleteId: text("athlete_id").notNull(),
  assignmentId: text("assignment_id").notNull(),
  data: jsonb("data").notNull(),
}, t => [index("workout_athlete_idx").on(t.athleteId)]);
export const coachingTable = pgTable("coaching_links", {
  coachId: text("coach_id").notNull(),
  athleteId: text("athlete_id").notNull(),
}, t => [primaryKey({ columns: [t.coachId, t.athleteId] })]);
export const invitationsTable = pgTable("coaching_invitations", {
  id: text("id").primaryKey(),
  coachId: text("coach_id").notNull(),
  name: text("name").notNull(),
  token: text("token").notNull().unique(),
  acceptedBy: text("accepted_by"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, t => [index("invitation_coach_idx").on(t.coachId)]);
export const insertProfileSchema = createInsertSchema(profilesTable);
export const insertProgramSchema = createInsertSchema(programsTable);
export const insertAssignmentSchema = createInsertSchema(assignmentsTable);
export const insertWorkoutSchema = createInsertSchema(workoutsTable);
