/** Shared scale for dashboard and progress; values are already in display units. */
export function maxTrendCeiling(points: {squat?:number|null;bench?:number|null;deadlift?:number|null}[]) {
  return points.reduce((best,p)=>Math.max(best,...[p.squat,p.bench,p.deadlift].filter((v):v is number=>typeof v==="number" && Number.isFinite(v))),0)+50;
}
