import { useState } from "react";
import type { GetAnalyticsDays } from "@workspace/api-client-react";
import { PageHeader } from "@/components/common";
import { AnalyticsView } from "@/components/analytics-view";
import { DaysToggle } from "@/components/days-toggle";
import { BodyweightProgress } from "@/components/bodyweight-tracking";
import { TrueMaxButton, TrueMaxHistory } from "@/components/true-max-tracking";

export default function Progress() {
  const [days, setDays] = useState<GetAnalyticsDays>(90);
  return (
    <div>
      <PageHeader kicker="Analytics" title="Progress">
        <DaysToggle value={days} onChange={setDays} />
        <TrueMaxButton />
      </PageHeader>
      <AnalyticsView days={days} />
      <TrueMaxHistory days={days} />
      <BodyweightProgress days={days} />
    </div>
  );
}
