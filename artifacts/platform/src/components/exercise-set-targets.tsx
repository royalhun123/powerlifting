import type { Exercise } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { firstInt } from "@/lib/pl";

export function ExerciseSetTargets({ exercise, onChange }: { exercise: Exercise; onChange: (patch: Partial<Exercise>) => void }) {
  const count = Math.min(firstInt(exercise.sets, 1), 100);
  const enabled = (exercise.setWeights?.length ?? 0) > 0;
  return (
    <div className="mt-3 rounded-sm border bg-background/60 p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Switch
          checked={enabled}
          onCheckedChange={on => onChange({ setWeights: on ? Array.from({ length: count }, () => null) : [] })}
          aria-label={`Custom weight for each set of ${exercise.name}`}
          data-testid={`switch-set-weights-${exercise.id}`}
        />
        Custom target weight for each set
        <span className="text-xs font-normal text-muted-foreground">(lbs)</span>
      </label>
      {enabled ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: count }, (_, i) => (
              <label key={i} className="grid gap-1 text-xs font-medium">
                Set {i + 1} · lbs
                <Input
                  type="number" min={0} max={2000} step="any" inputMode="decimal"
                  value={exercise.setWeights?.[i] ?? ""}
                  placeholder="No override"
                  aria-label={`${exercise.name} set ${i + 1} target weight in pounds`}
                  data-testid={`input-target-weight-${exercise.id}-${i}`}
                  onChange={event => {
                    const next = Array.from({ length: count }, (_, index) => exercise.setWeights?.[index] ?? null);
                    next[i] = event.target.value === "" ? null : Number(event.target.value);
                    onChange({ setWeights: next });
                  }}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Plan a different weight for every set. A blank target uses the exercise’s percentage or source weight. Athletes can always log a different actual weight.</p>
        </>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Use one source weight, or turn this on for ascending, descending, or back-off sets. Logged weights are always editable per set.</p>
      )}
    </div>
  );
}
