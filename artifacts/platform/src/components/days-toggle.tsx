import type { GetAnalyticsDays } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const OPTIONS: GetAnalyticsDays[] = [0, 180, 90, 30];

export function DaysToggle({ value, onChange, maxTrend=false }: { value: GetAnalyticsDays; onChange: (d: GetAnalyticsDays) => void; maxTrend?:boolean }) {
  return (
    <div className="inline-flex flex-wrap rounded-md border bg-card p-0.5">
      {OPTIONS.filter(d=>!maxTrend || d!==30).map((d) => (
        <button key={d} aria-pressed={value===d} onClick={() => onChange(d)} className={cn("rounded-sm px-3 py-1.5 font-num text-xs transition-colors", value === d ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")} data-testid={`button-days-${d}`}>
          {d===0 ? maxTrend ? "First–last lift" : "To date" : `${d/30} month${d===30 ? "" : "s"}`}
        </button>
      ))}
    </div>
  );
}
