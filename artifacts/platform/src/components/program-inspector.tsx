import { LifterMeasurements } from "@/components/lifter-measurements";
import { useState, type ReactNode } from "react";
import type { Assignment, CoachDirectoryEntry, Program } from "@workspace/api-client-react";
import { ChevronRight } from "lucide-react";
import { GroupedHistory } from "@/components/session-history";
import { fmtDate, PHASE_LABEL } from "@/lib/pl";
import { cn } from "@/lib/utils";

/** Read-only prescription view. */
function ProgramBody({ p }: { p: Program }) {
  const workouts = p.workouts.slice().sort((a, b) => a.week - b.week || a.day - b.day);
  return (
    <div className="mt-3 space-y-2">
      {p.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.description}</p>}
      {workouts.length === 0 ? <p className="border border-dashed p-3 text-xs text-muted-foreground">No workouts prescribed yet.</p> : workouts.map((w) => (
        <details key={w.id} className="group/w border bg-background" data-testid={`details-workout-${p.id}-${w.id}`}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm">
            <ChevronRight className="h-3.5 w-3.5 text-[#B4975A] transition-transform group-open/w:rotate-90" />
            <span className="font-num text-[11px] uppercase tracking-widest text-muted-foreground">W{w.week} · D{w.day}</span>
            <span className="font-medium">{w.name}</span>
            <span className="ml-auto font-num text-[10px] text-muted-foreground">{w.exercises.length} ex</span>
          </summary>
          <div className="overflow-x-auto border-t">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/60 font-num text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr><th className="px-3 py-1.5">Exercise</th><th className="px-2">Sets</th><th className="px-2">Reps</th><th className="px-2">Effort</th><th className="px-2">Load</th><th className="px-3">Notes</th></tr>
              </thead>
              <tbody className="divide-y">
                {w.exercises.map((ex) => (
                  <tr key={ex.id} className="align-top">
                    <td className="px-3 py-1.5 font-medium">{ex.name}</td>
                    <td className="px-2 py-1.5 font-num">{ex.sets || "—"}</td>
                    <td className="px-2 py-1.5 font-num">{ex.reps || "—"}</td>
                    <td className="px-2 py-1.5 font-num">{ex.effort || "—"}</td>
                    <td className="px-2 py-1.5 font-num">{ex.weight || "—"}</td>
                    <td className="max-w-[18rem] whitespace-pre-wrap px-3 py-1.5 text-muted-foreground">{ex.notes || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}

function ProgramCard({ p, meta, archived, testId }: { p: Program; meta: string; archived?: boolean; testId: string }) {
  return (
    <details className={cn("group/p border border-card-border bg-card", archived && "opacity-80")} data-testid={testId}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2.5">
        <ChevronRight className="h-4 w-4 text-primary transition-transform group-open/p:rotate-90" />
        <span className="font-display text-lg font-bold uppercase">{p.name}</span>
        <span className="border px-1.5 py-0.5 font-num text-[10px] uppercase tracking-widest">{PHASE_LABEL[p.phase] ?? p.phase}</span>
        {archived && <span className="font-num text-[10px] uppercase tracking-widest text-muted-foreground">archived</span>}
        <span className="w-full pl-6 font-num text-[11px] text-muted-foreground md:ml-auto md:w-auto md:pl-0">{meta}</span>
      </summary>
      <div className="border-t px-3 pb-3"><ProgramBody p={p} /></div>
    </details>
  );
}

function blockMeta(a: Assignment) {
  return `${a.program.weeks} wks · starts ${fmtDate(a.startDate)} · by ${a.program.uploaderName || a.coachName || "lifter"}`;
}
const blockCard = (prefix: string) => (a: Assignment) => <ProgramCard p={a.program} testId={`${prefix}-${a.id}`} meta={`Prescription · ${blockMeta(a)}`} />;

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
        <span className="h-px w-4 bg-[#B4975A]" />{title}<span className="font-num text-muted-foreground">({count})</span>
      </h4>
      {children}
    </section>
  );
}

/** One unified, read-only coach detail area: uploaded programs, coach's blocks, client's blocks. */
export function CoachDetail({ c }: { c: CoachDirectoryEntry }) {
  const programs = (c.programs ?? []).slice().sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || a.name.localeCompare(b.name));
  const blocks = c.blocks ?? [];
  const clients = (c.clients ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const client = clients.find((cl) => cl.id === clientId) ?? clients[0];

  return (
    <div className="rise mt-3 space-y-7 border-l-2 border-[#B4975A]/60 pl-4" data-testid={`inspector-coach-${c.userId}`}>
      <p className="font-num text-[10px] uppercase tracking-widest text-muted-foreground">Read-only inspection</p>

      <Section title="Uploaded programs" count={programs.length}>
        {programs.length === 0 ? <p className="text-xs text-muted-foreground">None.</p> : (
          <div className="space-y-2">
            {programs.map((p) => <ProgramCard key={p.id} p={p} archived={p.archived} testId={`program-${c.userId}-${p.id}`} meta={`${p.weeks} wks · ${p.workouts.length} workouts · source ${p.source || "manual"} · by ${p.uploaderName || c.name}`} />)}
          </div>
        )}
      </Section>

      <Section title="Measurements" count={0}>
        <LifterMeasurements athleteId={c.userId} athleteName={c.name || "This lifter"} />
      </Section>

      <Section title="Own blocks" count={blocks.length}>
        <GroupedHistory personId={c.userId} blocks={blocks} renderBlock={blockCard(`block-${c.userId}`)} />
      </Section>

      <Section title="Group members' blocks" count={clients.reduce((n, cl) => n + (cl.blocks?.length ?? 0), 0)}>
        {clients.length === 0 ? <p className="text-xs text-muted-foreground">No group members.</p> : (
          <div className="space-y-3">
            <div role="tablist" aria-label="Group members" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {clients.map((cl) => (
                <button key={cl.id} type="button" role="tab" aria-selected={client?.id === cl.id} onClick={() => setClientId(cl.id)} data-testid={`tab-client-${cl.id}`}
                  className={cn("shrink-0 border px-2.5 py-1 text-xs transition-colors", client?.id === cl.id ? "border-primary bg-primary text-primary-foreground" : "bg-secondary hover:bg-primary/15")}>
                  {cl.name} <span className="font-num opacity-70">({cl.blocks?.length ?? 0})</span>
                </button>
              ))}
            </div>
            {client && (
              <div role="tabpanel" aria-label={client.name}>
                <div className="mb-4"><LifterMeasurements key={`m-${client.id}`} athleteId={client.id} athleteName={client.name} /></div>
                <GroupedHistory key={client.id} personId={client.id} blocks={client.blocks ?? []} renderBlock={blockCard(`client-block-${client.id}`)} />
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
