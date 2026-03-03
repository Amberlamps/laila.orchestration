/**
 * Attempt History tab for the story detail page.
 *
 * Renders a vertical timeline of worker assignment/unassignment events.
 * Each entry shows the worker name (linked), timestamps, duration, and a
 * colored reason badge. The currently active assignment (if any) appears at
 * the top with a pulsing blue dot.
 *
 * States:
 *   - Loading: skeleton placeholders matching timeline layout
 *   - Empty: EmptyState with "No assignment history" message
 *   - Populated: reverse-chronological timeline entries
 */
import { CheckCircle2, Clock, History, Loader2, UserMinus, XCircle } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useStoryAttemptHistory } from '@/lib/query-hooks';

import type { AttemptEntry } from '@/lib/query-hooks';
import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StoryAttemptHistoryTabProps {
  storyId: string;
}

// ---------------------------------------------------------------------------
// Reason badge configuration
// ---------------------------------------------------------------------------

interface ReasonConfig {
  icon: LucideIcon;
  label: string;
  className: string;
  dotColor: string;
}

const REASON_CONFIG: Record<string, ReasonConfig> = {
  timeout: {
    icon: Clock,
    label: 'Timed out',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    dotColor: 'bg-amber-500',
  },
  manual: {
    icon: UserMinus,
    label: 'Manually unassigned',
    className: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    dotColor: 'bg-zinc-400',
  },
  failure: {
    icon: XCircle,
    label: 'Failed',
    className: 'bg-red-50 text-red-700 border-red-200',
    dotColor: 'bg-red-500',
  },
  complete: {
    icon: CheckCircle2,
    label: 'Completed',
    className: 'bg-green-50 text-green-700 border-green-200',
    dotColor: 'bg-green-500',
  },
};

/** Config for the active assignment (reason is null). */
const ACTIVE_CONFIG: ReasonConfig = {
  icon: Loader2,
  label: 'In progress',
  className: 'bg-blue-50 text-blue-700 border-blue-200',
  dotColor: 'bg-blue-500',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a duration in seconds to a human-readable string.
 *   - Under 1 hour: "45m"
 *   - 1-24 hours: "4h 32m"
 *   - Over 24 hours: "2d 1h"
 */
const formatDurationSeconds = (totalSeconds: number): string => {
  if (totalSeconds < 0) return '\u2014';

  const totalMinutes = Math.floor(totalSeconds / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${String(days)}d`);
  if (hours > 0) parts.push(`${String(hours)}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${String(minutes)}m`);
  return parts.join(' ');
};

/**
 * Formats an ISO timestamp as "Jan 15, 2026 at 2:30 PM".
 */
const formatTimestamp = (isoString: string): string => {
  const date = new Date(isoString);
  const datePart = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${datePart} at ${timePart}`;
};

/**
 * Returns the reason config for a given attempt entry.
 */
const getReasonConfig = (reason: AttemptEntry['reason']): ReasonConfig => {
  if (reason === null) return ACTIVE_CONFIG;
  return REASON_CONFIG[reason] ?? ACTIVE_CONFIG;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Loading skeleton for the attempt history timeline. */
const TimelineSkeleton = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading attempt history"
    className="relative pl-8"
  >
    <div className="absolute top-0 bottom-0 left-[11px] w-px bg-zinc-200" />
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="relative mb-6">
        {/* Dot placeholder */}
        <div className="absolute top-1 left-[-25px] h-2.5 w-2.5 rounded-full bg-zinc-200" />
        {/* Content placeholders */}
        <div className="space-y-2">
          <Skeleton width="140px" height="14px" rounded="rounded-sm" />
          <Skeleton width="220px" height="12px" rounded="rounded-sm" />
          <Skeleton width="220px" height="12px" rounded="rounded-sm" />
          <Skeleton width="100px" height="12px" rounded="rounded-sm" />
          <Skeleton width="90px" height="20px" rounded="rounded-sm" />
        </div>
      </div>
    ))}
  </div>
);

/** Reason badge with icon and label. */
const ReasonBadge = ({ reason }: { reason: AttemptEntry['reason'] }) => {
  const config = getReasonConfig(reason);
  const Icon = config.icon;
  const isActive = reason === null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      <Icon className={`h-3 w-3 ${isActive ? 'animate-pulse' : ''}`} aria-hidden="true" />
      {config.label}
    </span>
  );
};

/** A single timeline entry. */
const TimelineEntry = ({ attempt }: { attempt: AttemptEntry }) => {
  const config = getReasonConfig(attempt.reason);
  const isActive = attempt.reason === null;

  return (
    <div className="relative mb-6 last:mb-0">
      {/* Timeline dot */}
      <div
        className={`absolute top-1 left-[-25px] h-2.5 w-2.5 rounded-full ${config.dotColor} ${isActive ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      />

      {/* Entry content */}
      <div className="space-y-1">
        {/* Worker name */}
        {attempt.workerId ? (
          <Link
            href={`/workers/${attempt.workerId}`}
            className="text-sm font-semibold text-zinc-900 hover:text-indigo-600 hover:underline"
          >
            {attempt.workerName}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-zinc-400">Unknown Worker</span>
        )}

        {/* Assigned timestamp */}
        <p className="text-xs text-zinc-500">Assigned: {formatTimestamp(attempt.assignedAt)}</p>

        {/* Unassigned timestamp or "Currently assigned" */}
        <p className="text-xs text-zinc-500">
          {attempt.unassignedAt !== null ? (
            <>Unassigned: {formatTimestamp(attempt.unassignedAt)}</>
          ) : (
            <span className="text-blue-500">Currently assigned</span>
          )}
        </p>

        {/* Duration */}
        <p className="text-xs text-zinc-500">
          Duration:{' '}
          {attempt.durationSeconds !== null
            ? formatDurationSeconds(attempt.durationSeconds)
            : '\u2014'}
        </p>

        {/* Reason badge */}
        <div className="pt-1">
          <ReasonBadge reason={attempt.reason} />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function StoryAttemptHistoryTab({ storyId }: StoryAttemptHistoryTabProps) {
  const { data: attempts, isLoading } = useStoryAttemptHistory(storyId);

  // Loading state
  if (isLoading) {
    return (
      <div className="mt-6">
        <TimelineSkeleton />
      </div>
    );
  }

  // Empty state
  if (!attempts || attempts.length === 0) {
    return (
      <EmptyState
        icon={(props: { className?: string }) => <History {...props} />}
        title="No assignment history"
        description="This story has not been assigned to any workers yet. Assignment history will appear here once the story is picked up for execution."
      />
    );
  }

  // Populated timeline
  return (
    <div className="mt-6 overflow-y-auto">
      <div className="relative pl-8">
        {/* Vertical timeline line */}
        <div className="absolute top-0 bottom-0 left-[11px] w-px bg-zinc-200" />

        {/* Timeline entries (already in reverse chronological order from API) */}
        {attempts.map((attempt) => (
          <TimelineEntry key={attempt.id} attempt={attempt} />
        ))}
      </div>
    </div>
  );
}

export { StoryAttemptHistoryTab };
export type { StoryAttemptHistoryTabProps };
