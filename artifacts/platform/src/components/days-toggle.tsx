import type { GetAnalyticsDays } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const OPTIONS: GetAnalyticsDays[] = [28, 90, 365];

export function DaysToggle({ value, onChange }: { value: GetAnalyticsDays; onChange: (d: GetAnalyticsDays) => void }) {
  return (
    <div className="inline-flex rounded-md border bg-card p-0.5">
      {OPTIONS.map((d) => (
        <button key={d} onClick={() => onChange(d)} className={cn("rounded-sm px-3 py-1.5 font-num text-xs transition-colors", value === d ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")} data-testid={`button-days-${d}`}>
          {d === 365 ? "1y" : `${d}d`}
        </button>
      ))}
    </div>
  );
}
