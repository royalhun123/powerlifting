import { useState } from "react";
import type { GetAnalyticsDays } from "@workspace/api-client-react";
import { PageHeader } from "@/components/common";
import { AnalyticsView } from "@/components/analytics-view";
import { DaysToggle } from "@/components/days-toggle";

export default function Progress() {
  const [days, setDays] = useState<GetAnalyticsDays>(90);
  return (
    <div>
      <PageHeader kicker="Analytics" title="Progress">
        <DaysToggle value={days} onChange={setDays} />
      </PageHeader>
      <AnalyticsView days={days} />
    </div>
  );
}
