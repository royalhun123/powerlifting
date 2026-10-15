import { useState } from "react";
import { AssignmentOverview } from "@/components/assignment-overview";
import { LegacyAccessDetails, PasswordAccountsPanel } from "@/components/password-accounts-panel";
import { CalendarPlus, MessageSquare } from "lucide-react";
import { useAssignProgram, type GetAnalyticsDays } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkoutDiscussion } from "@/components/workout-discussion";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, LiftTag, LoadingPage, PageHeader, Panel } from "@/components/common";
import { ClientBodyweights } from "@/components/client-bodyweights";
import { WorkspaceBadge } from "@/components/workspace-badge";
import { AnalyticsView } from "@/components/analytics-view";
import { DaysToggle } from "@/components/days-toggle";
import { errMessage, useInvalidateAll, useMutationGuard, useWorkspace } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { fmtCompact, fmtDate, fmtNum, initials, todayISO } from "@/lib/pl";
import { cn } from "@/lib/utils";


export default function Clients() {
  const { data, isLoading, isError, error, refetch } = useWorkspace();
  const refreshRoster = () => { void refetch(); void invalidate(); };
  const assign = useAssignProgram();
  const invalidate = useInvalidateAll();
  const guard = useMutationGuard();
  const { toast } = useToast();
  const [selected, setSelected] = useState("");
  const [days, setDays] = useState<GetAnalyticsDays>(0);
  const [assignOpen, setAssignOpen] = useState(false);
  const [programId, setProgramId] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [openSession, setOpenSession] = useState("");

  if (isLoading) return <LoadingPage />;
  if (isError || !data) return <ErrorState message={errMessage(error)} onRetry={() => refetch()} />;

  const athlete = data.athletes.find((a) => a.id === selected) ?? data.athletes[0];
  const athleteSessions = athlete ? data.sessions.filter((s) => s.athleteId === athlete.id).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const athleteAssignments = athlete ? data.assignments.filter((a) => a.athleteId === athlete.id) : [];
  const assignable = data.programs.filter((p) => !p.archived);

  const doAssign = () => {
    if (!guard() || !athlete || !programId) return;
    assign.mutate(
      { data: { programId, athleteId: athlete.id, startDate } },
      {
        onSuccess: async (a) => {
          await invalidate();
          setAssignOpen(false);
          toast({ title: "Block assigned", description: `${a.program.name} → ${a.athleteName}` });
        },
        onError: (e) => toast({ title: "Assignment failed", description: errMessage(e), variant: "destructive" }),
      },
    );
  };

  return (
    <div>
      <PageHeader kicker="Coaching" title="My clients"><WorkspaceBadge /></PageHeader>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <Panel title={`Athletes (${data.athletes.length})`}>
            {data.athletes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No linked clients yet. Use “Create invitation link” under Password accounts below; clients appear here once they finish setup.</p>
            ) : (
              <ul className="-mx-2 space-y-1">
                {data.athletes.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => setSelected(a.id)} className={cn("flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left transition-colors", athlete?.id === a.id ? "bg-secondary" : "hover:bg-muted")} data-testid={`button-athlete-${a.id}`}>
                      <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-sidebar font-num text-xs text-sidebar-foreground">{initials(a.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.name}</span>
                        <span className="block font-num text-[10px] text-muted-foreground">{a.sessions} sessions · {fmtCompact(a.totalVolume)} {a.unit} · {a.lastActive ? fmtDate(a.lastActive) : "inactive"}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div>
          {!athlete ? (
            <EmptyState title="No athlete selected" body="Linked clients appear here with their sessions, analytics and a place for your feedback. Coaches review and comment; athletes log their own sessions." />
          ) : (
            <div className="space-y-5">
              <div className="rise flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="font-num text-[11px] uppercase tracking-[0.22em] text-primary">Athlete review</div>
                  <h2 className="font-display text-4xl font-bold uppercase leading-none" data-testid="text-athlete-name">{athlete.name}</h2>
                  <div className="mt-1 font-num text-xs text-muted-foreground">
                    {athleteAssignments.length ? athleteAssignments.map((a) => `${a.program.name} from ${a.startDate}`).join(" · ") : "No block assigned"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <DaysToggle value={days} onChange={setDays} />
                  <Button variant="outline" size="sm" onClick={() => (guard() ? setAssignOpen(true) : undefined)} data-testid="button-assign-client"><CalendarPlus className="mr-1.5 h-4 w-4" /> Assign block</Button>
                </div>
              </div>

              <AnalyticsView athleteId={athlete.id} days={days} />

              <ClientBodyweights key={athlete.id} athleteId={athlete.id} athleteName={athlete.name} days={days} />

              <Panel title="Sessions">
                {athleteSessions.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">{athlete.name} has not logged any sessions yet.</p>
                ) : (
                  <ul className="-my-2 divide-y">
                    {athleteSessions.map((s) => {
                      const open = openSession === s.id;
                      return (
                        <li key={s.id} className="py-3" data-testid={`row-client-session-${s.id}`}>
                          <button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setOpenSession(open ? "" : s.id)} data-testid={`button-open-session-${s.id}`}>
                            <div>
                              <div className="font-num text-[10px] uppercase tracking-widest text-muted-foreground">{fmtDate(s.date, { weekday: "short", month: "short", day: "numeric" })} · {s.status}</div>
                              <div className="font-medium">{s.name}</div>
                              <div className="font-num text-[11px] text-muted-foreground">{s.sets.filter((x) => x.completed).length}/{s.sets.length} sets · {fmtNum(s.volume)} {s.unit}</div>
                            </div>
                            {s.coachFeedback || s.discussions?.length ? <MessageSquare className="h-4 w-4 text-primary" /> : <span className="font-num text-[10px] uppercase tracking-widest text-muted-foreground">needs review</span>}
                          </button>
                          {open && (
                            <div className="mt-3 rounded-sm border bg-background/60 p-3">
                              <div className="overflow-x-auto">
                              <table className="w-full font-num text-xs">
                                <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                  <tr><th className="text-left">Exercise</th><th>Set</th><th>{s.unit}</th><th>Reps</th><th>RPE</th><th>Done</th><th className="px-3 text-left">Client set notes</th></tr>
                                </thead>
                                <tbody>
                                  {s.sets.map((x, i) => (
                                    <tr key={i} className={cn("border-t", !x.completed && "text-muted-foreground")}>
                                      <td className="py-1"><div>{x.exerciseName}</div><LiftTag lift={x.lift} /></td>
                                      <td className="text-center">{x.setNumber}</td>
                                      <td className="text-center">{x.weight || "—"}</td>
                                      <td className="text-center">{x.reps}</td>
                                      <td className="text-center">{x.rpe || "—"}</td>
                                      <td className="text-center">{x.completed ? "yes" : "no"}</td>
                                      <td className="min-w-36 max-w-xs whitespace-pre-wrap break-words px-3 py-2 font-sans text-sm" data-testid={`client-set-notes-${s.id}-${i}`}>{x.notes || <span className="text-muted-foreground">No notes</span>}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              </div>
                              <section className="mt-3 border bg-card p-3" aria-label="Client session notes">
                                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client session notes</h3>
                                <p className="whitespace-pre-wrap break-words text-sm" data-testid={`client-session-notes-${s.id}`}>{s.notes || <span className="text-muted-foreground">No session notes recorded.</span>}</p>
                              </section>
                              <WorkoutDiscussion session={s} className="mt-3" />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </div>
          )}
        </div>
      </div>

      <div className="mt-10 border-t pt-6" data-testid="section-account-management">
        <div className="mb-4 font-num text-[11px] uppercase tracking-[0.22em] text-primary">Accounts</div>
        <AssignmentOverview />
        <PasswordAccountsPanel onCreated={refreshRoster} />
        <LegacyAccessDetails />


      </div>



      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display text-2xl uppercase">Assign to {athlete?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Program</Label>
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger data-testid="select-assign-program"><SelectValue placeholder="Choose block" /></SelectTrigger>
                <SelectContent>{assignable.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-assign-date" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={doAssign} disabled={!programId || assign.isPending} data-testid="button-confirm-assign-client">{assign.isPending ? "Assigning…" : "Assign"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
