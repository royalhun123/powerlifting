import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getGetAnalyticsQueryKey, useGetAnalytics, type GetAnalyticsDays } from "@workspace/api-client-react";
import { Panel, ErrorState } from "@/components/common";
import { DaysToggle } from "@/components/days-toggle";
import { errMessage } from "@/hooks/use-platform";
import { fmtDate, fmtNum, LIFT_LABEL, LIFT_VAR } from "@/lib/pl";
import { maxTrendCeiling } from "@/lib/max-trend";

const lifts=["squat","bench","deadlift"] as const;
const DAY=86400000;
export function MaxTrendChart({athleteId}:{athleteId?:string}) {
  const [days,setDays]=useState<GetAnalyticsDays>(0);
  const params=athleteId ? {athleteId,days} : {days};
  const query=useGetAnalytics(params,{query:{queryKey:getGetAnalyticsQueryKey(params),staleTime:20_000,refetchInterval:60_000}});
  const points=(query.data?.trend??[]).filter(p=>lifts.some(l=>p[l]!==null)).map(p=>({...p,time:Date.parse(`${p.date}T00:00:00Z`)}));
  const unit=query.data?.unit??"lb";
  const ceiling=maxTrendCeiling(points);
  const step=Math.max(25,Math.ceil(ceiling/250)*50);
  const top=Math.ceil(ceiling/step)*step;
  const yTicks=Array.from({length:top/step+1},(_,i)=>i*step);
  const first=points[0]?.time??0,last=points.at(-1)?.time??first;
  const divisions=Math.max(1,Math.min(4,Math.round((last-first)/DAY)));
  const xTicks=first===last ? [first] : Array.from({length:divisions+1},(_,i)=>first+(last-first)*i/divisions);
  const dateLabel=(t:number)=>fmtDate(new Date(t).toISOString().slice(0,10));
  return <Panel title={`1RM trend (${unit})`} action={<DaysToggle value={days} onChange={setDays} maxTrend />}>
    <p className="mb-3 text-xs text-muted-foreground">Actual 1RMs and RPE 9 estimates. Each dot shows its date and weight; dashed lines connect consecutive entries for each lift.</p>
    {query.isLoading ? <p>Loading max history…</p> : query.isError ? <ErrorState message={errMessage(query.error)} onRetry={()=>query.refetch()} /> :
      !points.length ? <p className="py-8 text-center text-sm text-muted-foreground">No qualifying maxes in this period.</p> :
      <div className="overflow-x-auto">
        <div style={{height:360,minWidth:Math.max(540,points.length*110)}} data-testid="max-trend-line-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{left:10,right:65,top:65,bottom:30}}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
              <XAxis type="number" dataKey="time" scale="time" domain={first===last ? [first-DAY,last+DAY] : [first,last]} ticks={xTicks} interval={0} tickFormatter={dateLabel} tick={{fontSize:11}} />
              <YAxis domain={[0,top]} ticks={yTicks} interval={0} allowDataOverflow tick={{fontSize:11}} />
              <Tooltip labelFormatter={t=>dateLabel(Number(t))} formatter={(v:number,n:string)=>[`${fmtNum(v,1)} ${unit}`,LIFT_LABEL[n]??n]} contentStyle={{background:"hsl(var(--popover))",fontSize:12}} />
              {lifts.map((lift,index)=><Line key={lift} type="linear" dataKey={lift} stroke={LIFT_VAR[lift]} strokeWidth={2} strokeDasharray="6 5" connectNulls isAnimationActive={false}
                dot={({cx,cy,value,payload}:{cx?:number;cy?:number;value?:unknown;payload?:{date?:string}})=>{
                  if(typeof value!=="number" || cx===undefined || cy===undefined) return <g />;
                  const offset=index===1 ? 20 : index===2 ? -38 : -18;
                  return <g><circle cx={cx} cy={cy} r={4} fill={LIFT_VAR[lift]} /><text x={cx} y={cy+offset} textAnchor="middle" fill={LIFT_VAR[lift]} fontSize={10}>
                    <tspan x={cx}>{fmtNum(value,1)} {unit}</tspan><tspan x={cx} dy={12}>{payload?.date ? fmtDate(payload.date,{month:"short",day:"numeric",year:"2-digit"}) : ""}</tspan>
                  </text></g>;
                }} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>}
    <div className="mt-3 flex gap-4 text-xs">{lifts.map(l=><span key={l} style={{color:LIFT_VAR[l]}}>● {LIFT_LABEL[l]}</span>)}</div>
  </Panel>;
}
