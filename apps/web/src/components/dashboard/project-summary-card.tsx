/**
 * ProjectSummaryCard — Compact card component for the projects-at-a-glance grid.
 *
 * Displays key project metrics in a scannable format:
 * - Project name (linked to /projects/:id) — truncated at 40 chars with title tooltip
 * - StatusBadge showing current project status
 * - Mini progress bar showing task completion percentage
 * - Failure count — highlighted in red (text-red-500) when > 0
 * - Blocked count — highlighted in amber (text-amber-500) when > 0
 * - Active worker count with Bot icon
 *
 * Card has hover:shadow-md transition and rounded-lg border styling
 * consistent with the design system card pattern.
 */
import { AlertTriangle, Bot, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

import { Progress } from '@/components/ui/progress';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

import type { WorkStatus } from '@/components/ui/status-badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Data shape for a project summary card on the dashboard. */
export interface ProjectSummaryData {
  /** Project UUID */
  id: string;
  /** Human-readable project name */
  name: string;
  /** Current work status of the project */
  workStatus: string;
  /** Current lifecycle status of the project */
  lifecycleStatus: string;
  /** Task completion percentage (0-100) */
  completionPercentage: number;
  /** Number of failed tasks/stories in the project */
  failureCount: number;
  /** Number of blocked tasks/stories in the project */
  blockedCount: number;
  /** Number of currently active workers on the project */
  activeWorkerCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum character length for project name before truncation. */
const MAX_NAME_LENGTH = 40;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a lifecycle status string to the closest WorkStatus value
 * that StatusBadge can display.
 */
function toWorkStatus(lifecycleStatus: string, workStatus: string): WorkStatus {
  // If workStatus maps directly to a StatusBadge status, use it
  const directMap: Record<string, WorkStatus> = {
    pending: 'not_started',
    blocked: 'blocked',
    ready: 'ready',
    in_progress: 'in_progress',
    review: 'in_progress',
    done: 'complete',
    failed: 'failed',
    skipped: 'complete',
  };

  if (workStatus in directMap) {
    return directMap[workStatus] as WorkStatus;
  }

  // Fall back to lifecycle status mapping
  switch (lifecycleStatus) {
    case 'draft':
    case 'planning':
      return 'draft';
    case 'ready':
      return 'ready';
    case 'active':
      return 'in_progress';
    case 'completed':
    case 'archived':
      return 'complete';
    default:
      return 'draft';
  }
}

/**
 * Truncates a string to the specified max length, adding an ellipsis if needed.
 */
function truncateName(name: string, maxLength: number): string {
  if (name.length <= maxLength) {
    return name;
  }
  return name.slice(0, maxLength) + '\u2026';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ProjectSummaryCardProps {
  /** Project summary data to display */
  project: ProjectSummaryData;
}

function ProjectSummaryCard({ project }: ProjectSummaryCardProps) {
  const badgeStatus = toWorkStatus(project.lifecycleStatus, project.workStatus);
  const displayName = truncateName(project.name, MAX_NAME_LENGTH);
  const needsTooltip = project.name.length > MAX_NAME_LENGTH;

  return (
    <div
      className={cn(
        'rounded-lg border border-zinc-200 bg-white p-4 shadow-sm',
        'transition-shadow duration-200 hover:shadow-md',
      )}
    >
      {/* Header: Name + Status Badge */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm leading-tight font-semibold">
          <Link
            href={`/projects/${project.id}`}
            className="text-zinc-900 transition-colors hover:text-indigo-600"
            {...(needsTooltip ? { title: project.name } : {})}
          >
            {displayName}
          </Link>
        </h3>
        <StatusBadge status={badgeStatus} className="shrink-0" />
      </div>

      {/* Mini progress bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-zinc-500">Progress</span>
          <span className="text-xs font-medium text-zinc-700">
            {String(Math.round(project.completionPercentage))}%
          </span>
        </div>
        <Progress
          value={project.completionPercentage}
          className="h-1.5"
          indicatorClassName="bg-green-500"
          aria-label={`Task completion: ${String(Math.round(project.completionPercentage))}%`}
        />
      </div>

      {/* Metrics row: Failures, Blocked, Active Workers */}
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        {/* Failure count */}
        <span
          className={cn(
            'inline-flex items-center gap-1',
            project.failureCount > 0 && 'text-red-500',
          )}
          title="Failed tasks"
        >
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          <span>{String(project.failureCount)}</span>
        </span>

        {/* Blocked count */}
        <span
          className={cn(
            'inline-flex items-center gap-1',
            project.blockedCount > 0 && 'text-amber-500',
          )}
          title="Blocked tasks"
        >
          <ShieldAlert className="size-3.5" aria-hidden="true" />
          <span>{String(project.blockedCount)}</span>
        </span>

        {/* Active workers */}
        <span className="inline-flex items-center gap-1" title="Active workers">
          <Bot className="size-3.5" aria-hidden="true" />
          <span>{String(project.activeWorkerCount)}</span>
        </span>
      </div>
    </div>
  );
}

export { ProjectSummaryCard };
