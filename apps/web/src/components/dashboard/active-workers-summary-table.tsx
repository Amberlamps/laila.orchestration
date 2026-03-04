'use client';

/**
 * Active Workers Summary Table for the global dashboard.
 *
 * Displays all workers currently assigned to in-progress stories across
 * all projects. Each row shows the worker name, the project they are
 * working in, the story they are assigned to, and the elapsed time
 * since assignment.
 *
 * Uses the EntityTable component from the design system with compact
 * row styling for the dashboard context.
 */

import { Bot, Clock } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { EntityTable } from '@/components/ui/entity-table';
import { formatElapsedTime } from '@/lib/format-elapsed-time';
import { useActiveWorkers } from '@/lib/query-hooks';
import { cn } from '@/lib/utils';

import type { ColumnDef } from '@/components/ui/entity-table';
import type { TimeoutRisk } from '@/lib/format-elapsed-time';
import type { ActiveWorkerSummary } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** CSS class for timeout risk text color */
const RISK_COLOR_CLASS: Record<TimeoutRisk, string> = {
  normal: 'text-zinc-600',
  warning: 'text-amber-500',
  critical: 'text-red-500',
};

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
    <span className={cn('inline-flex items-center gap-1.5', RISK_COLOR_CLASS[risk])}>
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {formatted}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const columns: ColumnDef<ActiveWorkerSummary>[] = [
  {
    key: 'worker',
    header: 'Worker',
    cell: (row) => (
      <Link
        href={`/workers/${row.workerId}`}
        className="inline-flex items-center gap-1.5 font-medium text-zinc-900 transition-colors hover:text-indigo-600"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <Bot className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
        {row.workerName}
      </Link>
    ),
  },
  {
    key: 'project',
    header: 'Project',
    cell: (row) => (
      <Link
        href={`/projects/${row.projectId}`}
        className="text-zinc-700 transition-colors hover:text-indigo-600"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {row.projectName}
      </Link>
    ),
  },
  {
    key: 'story',
    header: 'Story',
    cell: (row) => (
      <Link
        href={`/projects/${row.projectId}/stories/${row.storyId}`}
        className="text-zinc-700 transition-colors hover:text-indigo-600"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {row.storyTitle}
      </Link>
    ),
  },
  {
    key: 'timeElapsed',
    header: 'Time Elapsed',
    align: 'right',
    cell: (row) => (
      <ElapsedTimeCell assignedAt={row.assignedAt} timeoutMinutes={row.timeoutMinutes} />
    ),
  },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * ActiveWorkersSummaryTable renders:
 *
 * - Section heading: "Active Workers" with Bot icon and count badge
 * - Table columns:
 *   1. Worker: worker name linked to /workers/:id, with Bot icon prefix
 *   2. Project: project name linked to /projects/:id
 *   3. Story: story title linked to /projects/:projectId/stories/:storyId
 *   4. Time Elapsed: duration since worker was assigned to the story
 *      (formatted as "Xh Ym" or "Xm Ys"), with Clock icon
 *
 * - Empty state: "No workers currently active" centered message
 * - Table uses compact row height for dashboard context
 */
export function ActiveWorkersSummaryTable() {
  const { data: workers, isLoading } = useActiveWorkers();

  const workerList = workers ?? [];

  return (
    <section>
      {/* Section header */}
      <div className="mb-3 flex items-center gap-2">
        <Bot className="h-5 w-5 text-zinc-500" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-zinc-900">Active Workers</h2>
        {!isLoading && (
          <Badge variant="secondary" className="ml-1">
            {String(workerList.length)}
          </Badge>
        )}
      </div>

      {/* Table */}
      <EntityTable<ActiveWorkerSummary>
        columns={columns}
        data={workerList}
        getRowKey={(row) => row.workerId}
        loading={isLoading}
        size="compact"
        emptyState={<p className="text-sm text-zinc-500">No workers currently active</p>}
      />
    </section>
  );
}
