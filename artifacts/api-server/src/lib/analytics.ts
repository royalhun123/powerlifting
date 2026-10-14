import type { Analytics, Session } from "./training-types";
import { convert, round } from "./training-types";

export function analytics(sessions: Session[], unit: "lb" | "kg", days: number, trueMaxes: {date:string;lift:"squat"|"bench"|"deadlift";weight:number;unit:"lb"|"kg"}[] = []): Analytics {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const rows = sessions.filter(s => s.status === "completed" && s.date >= cutoff.toISOString().slice(0,10)).sort((a,b) => a.date.localeCompare(b.date));
  const result: Analytics = { unit, completedSessions: rows.length, totalVolume: 0, totalSets: 0, totalReps: 0, records: ["squat","bench","deadlift"].map(lift => ({lift,bestWeight:0,estimatedMax:0,totalVolume:0,sets:0,date:""})),trend:[] };
  const byDate = new Map<string, Analytics["trend"][number]>();
  for (const row of rows) {
    const point = byDate.get(row.date) ?? {date:row.date,volume:0,squat:null,bench:null,deadlift:null,sessions:0};
    point.sessions++;
    for (const set of row.sets.filter(s => s.completed && s.reps > 0)) {
      const w = convert(set.weight, row.unit, unit);
      const volume = w*set.reps;
      result.totalSets++;
      result.totalReps += set.reps;
      result.totalVolume += volume;
      point.volume += volume;
      const record = result.records.find(r => r.lift === set.lift);
      if (record) {
        record.totalVolume += volume;
        record.sets++;
        if (w > record.bestWeight) { record.bestWeight = w; record.date = row.date; }
        // An actual maximal single is 1 rep at RPE 10. Estimates use only
        // RPE 9 sets (one rep in reserve), capped at 10 completed reps.
        const estimate = set.reps === 1 && set.rpe === 10 ? w
          : set.rpe === 9 && set.reps <= 10 ? w*(1+(set.reps+1)/30) : 0;
        record.estimatedMax = Math.max(record.estimatedMax,estimate);
        if (set.lift !== "accessory" && estimate > 0) point[set.lift] = Math.max(point[set.lift] ?? 0, estimate);
      }
    }
    byDate.set(row.date, point);
  }
  // A separately logged tested max contributes to max history, not workout volume.
  for (const max of trueMaxes.filter(m=>m.date>=cutoff.toISOString().slice(0,10))) {
    const weight=convert(max.weight,max.unit,unit);
    const point=byDate.get(max.date) ?? {date:max.date,volume:0,squat:null,bench:null,deadlift:null,sessions:0};
    point[max.lift]=Math.max(point[max.lift] ?? 0,weight);
    byDate.set(max.date,point);
    const record=result.records.find(r=>r.lift===max.lift)!;
    record.estimatedMax=Math.max(record.estimatedMax,weight);
    if(weight>record.bestWeight) {record.bestWeight=weight;record.date=max.date;}
  }
  result.totalVolume = round(result.totalVolume);
  result.records = result.records.map(r => ({...r,bestWeight:round(r.bestWeight),estimatedMax:round(r.estimatedMax),totalVolume:round(r.totalVolume)}));
  result.trend = [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(p => ({...p,volume:round(p.volume),squat:p.squat === null ? null : round(p.squat),bench:p.bench === null ? null : round(p.bench),deadlift:p.deadlift === null ? null : round(p.deadlift)}));
  return result;
}
