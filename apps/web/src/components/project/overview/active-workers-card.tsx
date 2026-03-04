'use client';

/**
 * Active Workers Card for the project overview tab.
 *
 * Displays workers currently assigned to in-progress stories within a specific
 * project. Each row shows the worker name (linked to worker detail), the story
 * they are assigned to (linked to story detail), and elapsed time since assignment.
 *
 * Uses shadcn/ui Card components with compact row styling.
 */

import { Bot, Clock } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatElapsedTime } from '@/lib/format-elapsed-time';
import { useProjectActiveWorkers } from '@/lib/query-hooks';
import { cn } from '@/lib/utils';

import type { TimeoutRisk } from '@/lib/format-elapsed-time';
import type { ActiveWorkerAssignment } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** CSS class for timeout risk text color */
const RISK_COLOR_CLASS: Record<TimeoutRisk, string> = {
  normal: 'text-zinc-600',
  warning: 'text-amber-500',
  critical: 'text-red-500',
};

/** Number of skeleton rows to display while loading */
const SKELETON_ROW_COUNT = 3;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ActiveWorkersCardProps {
  /** Project ID to scope the active workers query. */
  projectId: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Renders the elapsed time with a Clock icon and risk-based color. */
function ElapsedTimeCell({
  assignedAt,
  timeoutMinutes,
}: {
  assignedAt: string;
  timeoutMinutes: number;
}) {
  const { formatted, risk } = formatElapsedTime(assignedAt, timeoutMinutes);

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', RISK_COLOR_CLASS[risk])}>
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {formatted}
    </span>
  );
}

/** Renders a single worker assignment row. */
function WorkerRow({ worker, projectId }: { worker: ActiveWorkerAssignment; projectId: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md px-3 py-2 transition-colors hover:bg-zinc-50">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href={`/workers/${worker.workerId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-900 transition-colors hover:text-indigo-600"
        >
          <Bot className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
          <span className="truncate">{worker.workerName}</span>
        </Link>
        <Link
          href={`/projects/${projectId}/stories/${worker.storyId}`}
          className="truncate text-sm text-zinc-600 transition-colors hover:text-indigo-600"
        >
          {worker.storyTitle}
        </Link>
      </div>
      <ElapsedTimeCell assignedAt={worker.assignedAt} timeoutMinutes={worker.timeoutMinutes} />
    </div>
  );
}

/** Renders skeleton rows for the loading state. */
function LoadingSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading active workers">
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-3 py-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Skeleton width="120px" height="14px" rounded="rounded-sm" />
            <Skeleton width="180px" height="14px" rounded="rounded-sm" />
          </div>
          <Skeleton width="64px" height="14px" rounded="rounded-sm" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * ActiveWorkersCard renders:
 *
 * - Card header: "Active Workers" with Bot icon and count badge
 * - List of currently assigned workers, each row showing:
 *   - Worker name (linked to worker detail) with Bot icon
 *   - Assigned story title (linked to /projects/:projectId/stories/:storyId)
 *   - Time elapsed since assignment (Clock icon, formatted duration)
 *
 * - Empty state (centered within card):
 *   "No workers currently active."
 *   Subtle text-zinc-500 styling
 *
 * Each row uses a compact layout with space-between alignment.
 * Rows have hover:bg-zinc-50 for interactive feel.
 */
export function ActiveWorkersCard({ projectId }: ActiveWorkersCardProps) {
  const { data: workers, isLoading } = useProjectActiveWorkers(projectId);

  const workerList = workers ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-zinc-500" aria-hidden="true" />
          <span>Active Workers</span>
          {!isLoading && (
            <Badge variant="secondary" className="ml-1">
              {String(workerList.length)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <LoadingSkeleton />}

        {!isLoading && workerList.length === 0 && (
          <p className="py-4 text-center text-sm text-zinc-500">No workers currently active.</p>
        )}

        {!isLoading && workerList.length > 0 && (
          <div className="flex flex-col">
            {workerList.map((worker) => (
              <WorkerRow key={worker.workerId} worker={worker} projectId={projectId} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
