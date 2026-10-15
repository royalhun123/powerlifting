import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSessionDiscussionQueryKey, useCreateDiscussionThread, useGetSessionDiscussion, useReplyToDiscussion,
  type DiscussionThread, type LoggedSet, type SessionDiscussion,
} from "@workspace/api-client-react";
import { Lock, MessageSquare, RefreshCw, Reply, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/common";
import { errMessage, useWorkspace } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";

function newUuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Same id across retries of one message; a fresh id once it succeeds or the text changes. */
function useStableMessageId() {
  const ref = useRef<string | null>(null);
  return {
    get: () => (ref.current ??= newUuid()),
    reset: () => { ref.current = null; },
  };
}

function fmtStamp(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

type SessionLike = { id?: string; sets?: LoggedSet[] } | null | undefined;

export function WorkoutDiscussion({ session, readOnly, className }: { session: SessionLike; readOnly?: boolean; className?: string }) {
  const ws = useWorkspace();
  const shell = (body: React.ReactNode) => (
    <section className={cn("space-y-3 border border-card-border bg-card p-3", className)} aria-label="Workout comments" data-testid="section-workout-discussion">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
        <MessageSquare className="h-3.5 w-3.5" /> Comments
        {readOnly && <span className="ml-auto inline-flex items-center gap-1 font-num text-[10px] text-muted-foreground"><Lock className="h-3 w-3" /> read-only</span>}
      </h3>
      {body}
    </section>
  );
  if (!session?.id) return shell(<p className="border border-dashed p-3 text-xs text-muted-foreground" data-testid="text-discussion-unsaved">Save a draft first to start a conversation about this workout.</p>);
  if (ws.data?.demo) return shell(<p className="border border-dashed p-3 text-xs text-muted-foreground" data-testid="text-discussion-demo">Sign in to see and post comments. Demo workouts have no conversation.</p>);
  return shell(<DiscussionBody key={session.id} id={session.id} sets={session.sets ?? []} readOnly={!!readOnly} />);
}

function DiscussionBody({ id, sets, readOnly }: { id: string; sets: LoggedSet[]; readOnly: boolean }) {
  const key = getGetSessionDiscussionQueryKey(id);
  const q = useGetSessionDiscussion(id, { query: { queryKey: key, staleTime: 10_000, refetchInterval: 15_000, retry: 2 } });
  const qc = useQueryClient();
  const onSaved = (d: SessionDiscussion) => { qc.setQueryData(key, d); void qc.invalidateQueries({ queryKey: key }); };

  if (q.isLoading) return <div className="space-y-2" data-testid="discussion-loading">{[0, 1].map((i) => <div key={i} className="h-10 animate-pulse bg-muted" />)}</div>;
  if (!q.data) return <ErrorState message={errMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  const canPost = !readOnly && d.canPost;
  const threads = d.threads.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="space-y-3">
      {q.isError && <ErrorState message={`Could not refresh comments. Your draft is kept. ${errMessage(q.error)}`} onRetry={() => q.refetch()} />}
      {d.legacyFeedback && (
        <div className="border border-[#B4975A]/50 bg-[#B4975A]/5 p-2.5" data-testid="text-legacy-feedback">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Earlier coach feedback · whole workout</div>
          <p className="whitespace-pre-wrap text-sm">{d.legacyFeedback}</p>
        </div>
      )}
      {threads.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="text-discussion-empty">No comments yet.{canPost ? " Start one below about the whole workout, an exercise or a single set." : ""}</p>
      ) : (
        <ul className="space-y-2">{threads.map((t) => <ThreadView key={t.id} t={t} sessionId={id} canPost={canPost} onSaved={onSaved} />)}</ul>
      )}
      {canPost ? <NewThread sessionId={id} sets={sets} onSaved={onSaved} /> : !readOnly && <p className="font-num text-[10px] text-muted-foreground">Posting is closed for this workout.</p>}
      <div className="flex justify-end">
        <button type="button" onClick={() => q.refetch()} className="inline-flex items-center gap-1 font-num text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground" data-testid="button-refresh-discussion">
          <RefreshCw className={cn("h-3 w-3", q.isFetching && "animate-spin")} /> refresh
        </button>
      </div>
    </div>
  );
}

function ThreadView({ t, sessionId, canPost, onSaved }: { t: DiscussionThread; sessionId: string; canPost: boolean; onSaved: (d: SessionDiscussion) => void }) {
  const [replying, setReplying] = useState(false);
  return (
    <li className="border bg-background" data-testid={`thread-${t.id}`}>
      <div className="flex items-center gap-2 border-b px-2.5 py-1.5">
        <span className="border border-primary/40 px-1.5 py-0.5 font-num text-[10px] uppercase tracking-widest text-primary" data-testid={`text-thread-label-${t.id}`}>{t.label}</span>
        <span className="ml-auto font-num text-[10px] text-muted-foreground">{t.messages.length} msg</span>
      </div>
      <ol className="space-y-2 px-2.5 py-2">
        {t.messages.map((m) => (
          <li key={m.id} className={cn("max-w-[92%] border-l-2 pl-2", m.authorRole === "coach" ? "border-[#B4975A]" : "border-primary")}>
            <div className="font-num text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="font-semibold text-foreground">{m.authorName}</span> · {m.authorRole} · {fmtStamp(m.createdAt)}
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>
          </li>
        ))}
      </ol>
      {canPost && (
        <div className="border-t px-2.5 py-2">
          {replying ? <ReplyBox sessionId={sessionId} threadId={t.id} onSaved={onSaved} onClose={() => setReplying(false)} /> : (
            <button type="button" onClick={() => setReplying(true)} className="inline-flex items-center gap-1 font-num text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground" data-testid={`button-reply-${t.id}`}>
              <Reply className="h-3.5 w-3.5" /> reply
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function ReplyBox({ sessionId, threadId, onSaved, onClose }: { sessionId: string; threadId: string; onSaved: (d: SessionDiscussion) => void; onClose: () => void }) {
  const reply = useReplyToDiscussion();
  const mid = useStableMessageId();
  const [text, setText] = useState("");
  const send = () => {
    const body = text.trim();
    if (!body || reply.isPending) return;
    reply.mutate({ id: sessionId, threadId, data: { text: body, clientMessageId: mid.get() } }, {
      onSuccess: (d) => { mid.reset(); setText(""); onSaved(d); onClose(); },
    });
  };
  return (
    <div className="grid gap-2">
      <Textarea aria-label="Reply" value={text} disabled={reply.isPending} maxLength={2000} onChange={(e) => { setText(e.target.value); mid.reset(); }} className="min-h-[60px] text-sm" placeholder="Reply…" data-testid={`input-reply-${threadId}`} />
      {reply.isError && <p role="alert" className="text-xs text-destructive">Not sent: {errMessage(reply.error)}. Your text is kept; try again.</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={reply.isPending} onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={send} disabled={!text.trim() || reply.isPending} data-testid={`button-send-reply-${threadId}`}><Send className="mr-1.5 h-3.5 w-3.5" />{reply.isPending ? "Sending…" : reply.isError ? "Retry" : "Reply"}</Button>
      </div>
    </div>
  );
}

const selectCls = "h-9 w-full border bg-background px-2 text-sm";

function NewThread({ sessionId, sets, onSaved }: { sessionId: string; sets: LoggedSet[]; onSaved: (d: SessionDiscussion) => void }) {
  const create = useCreateDiscussionThread();
  const mid = useStableMessageId();
  const [scope, setScope] = useState<"workout" | "exercise" | "set">("workout");
  const [exerciseId, setExerciseId] = useState("");
  const [setNumber, setSetNumber] = useState("");
  const [text, setText] = useState("");
  const exercises = useMemo(() => {
    const m = new Map<string, { name: string; sets: number[] }>();
    for (const s of sets) {
      if (!s.exerciseId) continue;
      if (!m.has(s.exerciseId)) m.set(s.exerciseId, { name: s.exerciseName, sets: [] });
      m.get(s.exerciseId)!.sets.push(s.setNumber);
    }
    return [...m.entries()].map(([id, v]) => ({ id, name: v.name, sets: [...new Set(v.sets)].sort((a, b) => a - b) }));
  }, [sets]);
  const ex = exercises.find((e) => e.id === exerciseId);
  const touch = () => mid.reset();
  const valid = !!text.trim() && (scope === "workout" || (!!ex && (scope === "exercise" || !!setNumber)));

  const send = () => {
    if (!valid || create.isPending) return;
    create.mutate({ id: sessionId, data: {
      scope, text: text.trim(), clientMessageId: mid.get(),
      ...(scope !== "workout" ? { exerciseId } : {}),
      ...(scope === "set" ? { setNumber: Number(setNumber) } : {}),
    } }, { onSuccess: (d) => { mid.reset(); setText(""); onSaved(d); } });
  };

  return (
    <div className="grid gap-2 border-t pt-3" data-testid="form-new-thread">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">New comment</div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs">About
          <select className={selectCls} disabled={create.isPending} value={scope} onChange={(e) => { setScope(e.target.value as typeof scope); touch(); }} data-testid="select-thread-scope">
            <option value="workout">Whole workout</option>
            <option value="exercise" disabled={!exercises.length}>An exercise</option>
            <option value="set" disabled={!exercises.length}>A single set</option>
          </select>
        </label>
        {scope !== "workout" && (
          <label className="grid gap-1 text-xs">Exercise
            <select className={selectCls} disabled={create.isPending} value={exerciseId} onChange={(e) => { setExerciseId(e.target.value); setSetNumber(""); touch(); }} data-testid="select-thread-exercise">
              <option value="">Choose…</option>
              {exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        )}
        {scope === "set" && (
          <label className="grid gap-1 text-xs">Set
            <select className={selectCls} value={setNumber} onChange={(e) => { setSetNumber(e.target.value); touch(); }} disabled={!ex || create.isPending} data-testid="select-thread-set">
              <option value="">Choose…</option>
              {ex?.sets.map((n) => <option key={n} value={n}>Set {n}</option>)}
            </select>
          </label>
        )}
      </div>
      <Textarea aria-label="Comment" value={text} disabled={create.isPending} maxLength={2000} onChange={(e) => { setText(e.target.value); touch(); }} className="min-h-[70px] text-sm" placeholder="Bar speed, depth, RPE calibration, a question for your coach…" data-testid="input-new-thread" />
      {create.isError && <p role="alert" className="text-xs text-destructive">Not sent: {errMessage(create.error)}. Your text is kept; try again.</p>}
      <div className="flex justify-end">
        <Button size="sm" onClick={send} disabled={!valid || create.isPending} data-testid="button-send-thread"><Send className="mr-1.5 h-3.5 w-3.5" />{create.isPending ? "Sending…" : create.isError ? "Retry" : "Post comment"}</Button>
      </div>
    </div>
  );
}
