import { randomUUID } from "node:crypto";
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, workoutsTable, coachingTable, coachesTable } from "@workspace/db";
import {
  CreateDiscussionThreadBody, ReplyToDiscussionBody, GetSessionDiscussionResponse,
  SaveSessionResponse,
} from "@workspace/api-zod";
import { isAdmin, isCoach } from "../lib/coach-access";
import { ensureProfile, linked } from "../lib/training-store";
import { fail, type Session } from "../lib/training-types";

const router = Router();
type WorkoutRow = typeof workoutsTable.$inferSelect;
type Thread = NonNullable<Session["discussions"]>[number];

router.use("/sessions/:id/discussion", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.user) fail(401, "Sign in to view workout comments.");
  next();
});

async function access(row: WorkoutRow, userId: string) {
  if (await isAdmin(userId)) {
    const [client] = await db.select({ id: coachingTable.athleteId }).from(coachingTable)
      .innerJoin(coachesTable, eq(coachingTable.coachId, coachesTable.userId))
      .where(eq(coachingTable.athleteId, row.athleteId)).limit(1);
    if (row.athleteId !== userId && !client && !await isCoach(row.athleteId)) {
      fail(403, "This athlete is not in the coach directory.");
    }
    return { canPost: false, role: "coach" as const };
  }
  if (row.athleteId === userId) return { canPost: true, role: "athlete" as const };
  if (await isCoach(userId) && await linked(userId, row.athleteId)) {
    return { canPost: true, role: "coach" as const };
  }
  fail(403, "You do not have access to this workout conversation.");
}

function response(session: Session, canPost: boolean) {
  return GetSessionDiscussionResponse.parse({
    sessionId: session.id, canPost, legacyFeedback: session.coachFeedback,
    threads: session.discussions ?? [],
  });
}

router.get("/sessions/:id/discussion", async (req, res) => {
  const [row] = await db.select().from(workoutsTable).where(eq(workoutsTable.id, req.params.id));
  if (!row) fail(404, "Workout log not found.");
  const permission = await access(row, req.user!.id);
  res.json(response(SaveSessionResponse.parse(row.data), permission.canPost));
});

// Session edits, legacy feedback and comments all lock the same row. Appending
// comments cannot overwrite sets; editing a workout retains its conversation.
async function postMessage(
  sessionId: string, userId: string,
  input: ReturnType<typeof CreateDiscussionThreadBody.parse> | ReturnType<typeof ReplyToDiscussionBody.parse>,
  threadId?: string,
) {
  const text = input.text.trim();
  if (!text) fail(400, "Enter a comment or reply.");
  return db.transaction(async tx => {
    const [row] = await tx.select().from(workoutsTable).where(eq(workoutsTable.id, sessionId)).for("update");
    if (!row) fail(404, "Workout log not found.");
    const permission = await access(row, userId);
    if (!permission.canPost) fail(403, "Admin access is read-only.");
    const session = SaveSessionResponse.parse(row.data);
    const threads = session.discussions ?? [];
    let target: Pick<Thread, "scope" | "label" | "exerciseId" | "setNumber"> | undefined;
    let thread = threadId ? threads.find(t => t.id === threadId) : undefined;
    if (threadId && !thread) fail(404, "Comment thread not found in this workout.");
    if (!threadId) {
      const body = CreateDiscussionThreadBody.parse(input);
      if (body.scope === "workout") {
        if (body.exerciseId !== undefined || body.setNumber !== undefined) fail(400, "Whole-workout comments cannot target a set.");
        target = { scope: "workout", label: "Whole workout" };
      } else {
        const set = session.sets.find(s => s.exerciseId === body.exerciseId &&
          (body.scope === "exercise" || s.setNumber === body.setNumber));
        if (!set) fail(400, "Choose an exercise or set from this saved workout.");
        if (body.scope === "exercise" && body.setNumber !== undefined) fail(400, "Exercise comments cannot target a set number.");
        target = {
          scope: body.scope, exerciseId: set.exerciseId,
          ...(body.scope === "set" ? { setNumber: set.setNumber } : {}),
          label: `${set.exerciseName}${body.scope === "set" ? ` · Set ${set.setNumber}` : " · All sets"}`,
        };
      }
    }
    // Idempotent retries avoid duplicate chat messages after a lost response.
    for (const existing of threads) {
      const duplicate = existing.messages.find(m => m.clientMessageId === input.clientMessageId);
      if (!duplicate) continue;
      const sameTarget = threadId ? existing.id === threadId :
        existing.scope === target!.scope && existing.exerciseId === target!.exerciseId && existing.setNumber === target!.setNumber;
      if (duplicate.authorId !== userId || duplicate.text !== text || !sameTarget) fail(409, "This message identifier has already been used.");
      return response(session, true);
    }
    if (threads.reduce((count, t) => count + t.messages.length, 0) >= 1000 ||
      (!threadId && threads.length >= 100)) fail(409, "This workout conversation has reached its message limit.");
    const now = new Date().toISOString();
    const author = await ensureProfile(userId, permission.role === "coach" ? "Coach" : "Athlete");
    if (!thread) {
      thread = { ...target!, id: randomUUID(), createdAt: now, messages: [] };
      threads.push(thread);
    }
    thread.messages.push({
      id: randomUUID(), clientMessageId: input.clientMessageId,
      authorId: userId, authorName: author.name, authorRole: permission.role, text, createdAt: now,
    });
    const saved: Session = { ...session, discussions: threads };
    await tx.update(workoutsTable).set({ data: saved }).where(eq(workoutsTable.id, row.id));
    return response(saved, true);
  });
}

router.post("/sessions/:id/discussion", async (req, res) => {
  res.json(await postMessage(req.params.id, req.user!.id, CreateDiscussionThreadBody.parse(req.body)));
});
router.post("/sessions/:id/discussion/:threadId/replies", async (req, res) => {
  res.json(await postMessage(req.params.id, req.user!.id, ReplyToDiscussionBody.parse(req.body), req.params.threadId));
});

export default router;
