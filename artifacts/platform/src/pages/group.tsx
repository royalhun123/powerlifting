import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateGroupInvitation, useCreateLiftingGroup, useDeleteLiftingGroup, useLeaveLiftingGroup, useListLiftingGroups, getListLiftingGroupsQueryKey } from "@workspace/api-client-react";
import { Copy, Crown, EyeOff, Link2, LogOut, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ErrorState, LoadingPage, PageHeader, Panel } from "@/components/common";
import { WorkspaceBadge } from "@/components/workspace-badge";
import { errMessage, useMutationGuard, useWorkspace } from "@/hooks/use-platform";
import { useToast } from "@/hooks/use-toast";
import { initials } from "@/lib/pl";
import GroupLeaderReview from "@/pages/clients";

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function LiftingGroupPage() {
  const { data, isLoading, isError, error, refetch } = useWorkspace();
  const qc = useQueryClient();
  const guard = useMutationGuard();
  const { toast } = useToast();
  const group = data?.group ?? null;
  const groups = useListLiftingGroups({ query: { queryKey: getListLiftingGroupsQueryKey(), enabled: !!group } });
  const create = useCreateLiftingGroup();
  const leave = useLeaveLiftingGroup();
  const del = useDeleteLiftingGroup();
  const invite = useCreateGroupInvitation();
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);
  const [fresh, setFresh] = useState<{ url: string; expiresAt: string } | null>(null);

  if (isLoading) return <LoadingPage />;
  if (isError || !data) return <ErrorState message={errMessage(error)} onRetry={() => refetch()} />;

  const refreshAll = () => qc.invalidateQueries();
  const isLeader = !!group && (data.isGroupLeader ?? group.leaderId === data.profile.id);
  const full = groups.data?.find((g) => g.id === group?.id);
  const members = (full?.members ?? []).slice().sort((a, b) => (a.id === group?.leaderId ? -1 : b.id === group?.leaderId ? 1 : a.name.localeCompare(b.name)));

  const doCreate = () => {
    const n = name.trim();
    if (!guard() || !n) return;
    create.mutate({ data: { name: n } }, {
      onSuccess: async (g) => { setName(""); await refreshAll(); toast({ title: "Group created", description: `You lead ${g.name}.` }); },
      onError: (e) => toast({ title: "Could not create group", description: errMessage(e), variant: "destructive" }),
    });
  };
  const doInvite = () => {
    if (!guard()) return;
    invite.mutate(undefined, {
      onSuccess: (r) => { setFresh({ url: window.location.origin + r.path, expiresAt: r.expiresAt }); toast({ title: "Group link created. Copy it now." }); },
      onError: (e) => toast({ title: "Could not create link", description: errMessage(e), variant: "destructive" }),
    });
  };
  const doConfirm = () => {
    const m = confirm === "delete" ? del : leave;
    m.mutate(undefined, {
      onSuccess: async () => { setConfirm(null); setFresh(null); await refreshAll(); toast({ title: confirm === "delete" ? "Group deleted" : "You left the group", description: "All training history is kept." }); },
      onError: (e) => toast({ title: confirm === "delete" ? "Could not delete group" : "Could not leave group", description: errMessage(e), variant: "destructive" }),
    });
  };

  return (
    <div>
      <PageHeader kicker="Lifting group" title={group ? group.name : "Lifting group"}><WorkspaceBadge /></PageHeader>

      {!group ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Panel title={<span className="inline-flex items-center gap-2"><Users className="h-4 w-4 text-[#B4975A]" /> Start a group</span>}>
            <p className="mb-4 text-sm text-muted-foreground">You train independently. Create a named group to lead other lifters: you can assign them blocks, review their sessions and bodyweights, and discuss workouts. Your own training stays exactly where it is.</p>
            <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); doCreate(); }}>
              <label className="grid min-w-[220px] flex-1 gap-1.5 text-sm">Group name
                <Input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tuesday heavy crew" data-testid="input-group-name" />
              </label>
              <Button type="submit" disabled={!name.trim() || create.isPending} data-testid="button-create-group">{create.isPending ? "Creating…" : "Create group"}</Button>
            </form>
          </Panel>
          <Panel title="Joining instead?">
            <p className="text-sm text-muted-foreground">Ask a group leader for a one-time group link and open it while signed in. You can only belong to one group at a time.</p>
          </Panel>
        </div>
      ) : (
        <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Panel title="Roster" action={<span className="inline-flex items-center gap-1.5 border border-[#B4975A]/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]" data-testid="text-group-role">{isLeader ? <><Crown className="h-3 w-3 text-[#B4975A]" /> Group leader</> : "Member"}</span>}>
            {groups.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse bg-muted" />)}</div>
              : groups.isError ? <ErrorState message={errMessage(groups.error)} onRetry={() => groups.refetch()} />
              : members.length === 0 ? <p className="text-sm text-muted-foreground">No members listed yet.</p>
              : <ul className="divide-y border-y">{members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2.5" data-testid={`row-group-member-${m.id}`}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-sidebar font-num text-xs text-sidebar-foreground">{initials(m.name || "?")}</span>
                    <span className="flex-1 text-sm font-medium">{m.name || "Lifter"}{m.id === data.profile.id && <span className="ml-2 text-xs text-muted-foreground">you</span>}</span>
                    <span className="font-num text-[10px] uppercase tracking-widest text-muted-foreground">{m.id === group.leaderId ? "Leader" : "Lifter"}</span>
                  </li>))}</ul>}
          </Panel>
          <div className="space-y-5">
            {isLeader && (
              <Panel title={<span className="inline-flex items-center gap-2"><Link2 className="h-4 w-4 text-[#B4975A]" /> Invite a lifter</span>}>
                <p className="mb-3 text-sm text-muted-foreground">One-time link, valid 24 hours. New lifters choose their own username and password; existing lifters sign in and confirm.</p>
                <Button onClick={doInvite} disabled={invite.isPending} data-testid="button-create-group-invite">{invite.isPending ? "Creating…" : "Create group link"}</Button>
                {fresh && (
                  <div className="rise mt-4 space-y-2 border border-[#B4975A]/60 bg-[#B4975A]/5 p-3" data-testid="panel-fresh-group-link">
                    <p className="text-sm font-medium">Shown only now. One use, expires {fmtWhen(fresh.expiresAt)}.</p>
                    <Input readOnly value={fresh.url} aria-label="One-time group invitation link" className="font-num text-xs" onFocus={(e) => e.currentTarget.select()} data-testid="input-fresh-group-link" />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" data-testid="button-copy-group-link" onClick={async () => { try { await navigator.clipboard.writeText(fresh.url); toast({ title: "Link copied" }); } catch { toast({ title: "Select and copy the link above", variant: "destructive" }); } }}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link</Button>
                      <Button variant="ghost" size="sm" data-testid="button-hide-group-link" onClick={() => { setFresh(null); invite.reset(); }}><EyeOff className="mr-1.5 h-3.5 w-3.5" /> Hide link</Button>
                    </div>
                  </div>
                )}
              </Panel>
            )}
            <Panel title={isLeader ? "Delete group" : "Leave group"}>
              <p className="mb-3 text-sm text-muted-foreground">{isLeader ? "Deleting the group removes every member from it. Nobody's training, blocks or history is deleted." : "Leaving keeps all your blocks, sessions and progress. Only the group leader can delete the group."}</p>
              {isLeader
                ? <Button variant="outline" className="text-destructive" onClick={() => guard() && setConfirm("delete")} data-testid="button-delete-group"><Trash2 className="mr-1.5 h-4 w-4" /> Delete group</Button>
                : <Button variant="outline" onClick={() => guard() && setConfirm("leave")} data-testid="button-leave-group"><LogOut className="mr-1.5 h-4 w-4" /> Leave group</Button>}
            </Panel>
          </div>
        </div>
      )}

      {isLeader && (
        <div className="border-t pt-6">
          <div className="mb-4 font-num text-[11px] uppercase tracking-[0.22em] text-primary">Group leader · lifter review</div>
          <GroupLeaderReview />
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? `Delete ${group?.name}?` : `Leave ${group?.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "All members leave the group immediately and you stop being their group leader. All training is preserved: every lifter keeps their blocks, logged sessions, bodyweights and progress, and your program library is untouched."
                : "You will no longer be part of this group and the leader will stop seeing your training. Your blocks, sessions and progress stay with you."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={leave.isPending || del.isPending} onClick={(e) => { e.preventDefault(); doConfirm(); }} data-testid="button-confirm-group-action">
              {leave.isPending || del.isPending ? "Working…" : confirm === "delete" ? "Delete group" : "Leave group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
