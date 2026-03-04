/**
 * Overall Progress Indicator card for the project overview tab.
 *
 * Displays a circular SVG progress ring showing the project's overall
 * completion percentage, with dynamic color thresholds and animated
 * transitions. Below the ring, a task completion summary is shown.
 *
 * Color thresholds:
 * - 0-25%: zinc-400 (early stage)
 * - 25-50%: amber-500 (getting started)
 * - 50-75%: indigo-500 (progressing)
 * - 75-99%: blue-500 (nearly done)
 * - 100%: emerald-500 (complete)
 *
 * Data is fetched from `GET /api/v1/projects/:id/overview` using a locally
 * defined query hook to avoid modifying shared query infrastructure.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { PieChart } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the progress data returned by the project overview API. */
interface ProjectProgressData {
  percentage: number;
  completed_tasks: number;
  total_tasks: number;
}

/** Response wrapper for the project overview API endpoint. */
interface ProjectOverviewResponse {
  data: {
    progress: ProjectProgressData;
  };
}

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

/**
 * Returns the appropriate CSS color value for the progress arc
 * based on the completion percentage threshold.
 */
function getProgressColor(percentage: number): string {
  if (percentage >= 100) return 'var(--color-success-500)';
  if (percentage >= 75) return 'var(--color-info-500)';
  if (percentage >= 50) return 'var(--color-primary-500)';
  if (percentage >= 25) return 'var(--color-warning-500)';
  return 'var(--color-zinc-400)';
}

// ---------------------------------------------------------------------------
// Local query hook
// ---------------------------------------------------------------------------

/**
 * Fetches project overview data including progress metrics.
 * Defined locally to avoid modifying the shared query-hooks module.
 */
function useProjectOverview(projectId: string) {
  return useQuery<ProjectOverviewResponse>({
    queryKey: [...queryKeys.projects.detail(projectId), 'overview'],
    queryFn: async (): Promise<ProjectOverviewResponse> => {
      const response = await fetch(`/api/v1/projects/${projectId}/overview`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch project overview: ${String(response.status)}`);
      }

      return (await response.json()) as ProjectOverviewResponse;
    },
    enabled: projectId.length > 0,
  });
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

/** Circular skeleton placeholder matching the progress ring dimensions. */
function ProgressRingSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading progress"
      className="flex flex-col items-center gap-4"
    >
      {/* Circular skeleton for the ring */}
      <Skeleton width="160px" height="160px" rounded="rounded-full" />

      {/* Task count text skeleton */}
      <Skeleton width="140px" height="14px" rounded="rounded-sm" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface OverallProgressIndicatorProps {
  /** The project ID to fetch progress data for. */
  projectId: string;
}

/**
 * OverallProgressIndicator renders a Card containing:
 * 1. Header with "Overall Progress" title and PieChart icon
 * 2. Circular SVG progress ring with dynamic color thresholds
 * 3. Task completion summary text below the ring
 */
function OverallProgressIndicator({ projectId }: OverallProgressIndicatorProps) {
  const { data, isLoading } = useProjectOverview(projectId);

  const progress = data?.data.progress;
  const percentage = progress?.percentage ?? 0;
  const completedTasks = progress?.completed_tasks ?? 0;
  const totalTasks = progress?.total_tasks ?? 0;
  const progressColor = getProgressColor(percentage);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <PieChart className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          Overall Progress
        </CardTitle>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <ProgressRingSkeleton />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <ProgressRing value={percentage} progressColor={progressColor} />

            <p className="text-sm text-zinc-600">
              {String(completedTasks)} of {String(totalTasks)} tasks completed
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { OverallProgressIndicator };
export type { OverallProgressIndicatorProps, ProjectProgressData };
