import type { Exercise, Workout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newId } from "@/lib/pl";

export function CircuitEditor({ workout, onChange, blankExercise }: {
  workout: Workout;
  onChange: (patch: Partial<Workout>) => void;
  blankExercise: () => Exercise;
}) {
  return <div className="space-y-3 px-4">
    {(workout.circuits || []).map(circuit => (
      <div key={circuit.id} className="my-3 rounded-md border border-primary/40 bg-primary/5 p-3" data-testid={`circuit-${circuit.id}`}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs">Circuit name
            <Input value={circuit.name} onChange={e => onChange({ circuits: workout.circuits!.map(c => c.id === circuit.id ? { ...c, name: e.target.value } : c) })} />
          </label>
          <label className="grid gap-1 text-xs">Rounds
            <Input className="w-24" type="number" min={1} max={100} value={circuit.rounds} onChange={e => {
              const rounds = Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1)));
              onChange({ circuits: workout.circuits!.map(c => c.id === circuit.id ? { ...c, rounds } : c),
                exercises: workout.exercises.map(ex => ex.circuitId === circuit.id ? { ...ex, sets: String(rounds) } : ex) });
            }} />
          </label>
          <label className="grid gap-1 text-xs">Rest between rounds (seconds)
            <Input className="w-28" type="number" min={0} max={3600} value={circuit.restSeconds} onChange={e => onChange({ circuits: workout.circuits!.map(c => c.id === circuit.id ? { ...c, restSeconds: Math.max(0, Math.min(3600, Math.round(Number(e.target.value) || 0))) } : c) })} />
          </label>
          <Button variant="outline" size="sm" onClick={() => {
            const exercises = [...workout.exercises];
            const last = exercises.findLastIndex(ex => ex.circuitId === circuit.id);
            exercises.splice(last < 0 ? exercises.length : last + 1, 0, { ...blankExercise(), circuitId: circuit.id, sets: String(circuit.rounds) });
            onChange({ exercises });
          }}>Add exercise to {circuit.name || "circuit"}</Button>
          <Button variant="ghost" size="sm" onClick={() => onChange({
            circuits: workout.circuits!.filter(c => c.id !== circuit.id),
            exercises: workout.exercises.map(ex => ex.circuitId === circuit.id ? { ...ex, circuitId: undefined } : ex),
          })}>Ungroup circuit</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Do one set of each exercise per round, then rest. Edit the exercises below. Ungroup keeps the exercises.</p>
      </div>
    ))}
  </div>;
}

export function newCircuit(workout: Workout, blankExercise: () => Exercise): Partial<Workout> {
  const circuit = { id: newId("circuit"), name: `Circuit ${(workout.circuits?.length || 0) + 1}`, rounds: 3, restSeconds: 60 };
  return { circuits: [...(workout.circuits || []), circuit], exercises: [...workout.exercises, { ...blankExercise(), sets: "3", circuitId: circuit.id }] };
}
