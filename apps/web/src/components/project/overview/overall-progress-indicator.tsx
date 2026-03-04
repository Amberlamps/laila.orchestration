/**
 * Overall progress indicator card for the project overview tab.
 *
 * Displays a circular SVG progress ring showing project completion
 * percentage alongside a task completion summary. Data is fetched via
 * the `useProjectOverview` hook from GET /api/v1/projects/:id/overview.
 *
 * Visual spec:
 *   - Card with "Overall Progress" header and PieChart icon
 *   - 160px circular progress ring with color thresholds
 *   - Center text: percentage in JetBrains Mono, text-3xl, font-bold
 *   - Below center: "complete" in text-sm, text-zinc-500
 *   - Below ring: "X of Y tasks completed" in text-sm, text-zinc-600
 *   - Loading state: circular skeleton placeholder
 */

import { PieChart } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectOverview } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OverallProgressIndicatorProps {
  /** The project ID to fetch overview data for. */
  projectId: string;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

/** Circular skeleton placeholder matching the progress ring dimensions. */
function OverallProgressSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PieChart className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          Overall Progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          role="status"
          aria-live="polite"
          aria-label="Loading progress"
          className="flex flex-col items-center gap-4"
        >
          <Skeleton width="160px" height="160px" rounded="rounded-full" />
          <Skeleton width="140px" height="14px" rounded="rounded-sm" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function OverallProgressIndicator({ projectId }: OverallProgressIndicatorProps) {
  const { data, isLoading } = useProjectOverview(projectId);

  if (isLoading || !data) {
    return <OverallProgressSkeleton />;
  }

  const { progressPercentage, completedTasks, totalTasks } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PieChart className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          Overall Progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4">
          <ProgressRing value={progressPercentage} />
          <p className="text-sm text-zinc-600">
            {String(completedTasks)} of {String(totalTasks)} tasks completed
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export { OverallProgressIndicator, OverallProgressSkeleton };
export type { OverallProgressIndicatorProps };
