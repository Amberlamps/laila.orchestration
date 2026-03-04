/**
 * Recent Activity Snapshot — dashboard section component.
 *
 * Displays the last 20 audit events across all projects, newest first.
 * Each entry shows the timestamp, actor, action, target entity, and
 * project name with appropriate links.
 *
 * States:
 * - Loading: Skeleton row placeholders
 * - Empty: "No recent activity" message
 * - Data: Chronological list of audit entries with a "View all in Audit" footer link
 */

import { Activity, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { AuditEntry } from '@/components/audit/audit-entry';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardActivity } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

/** Number of skeleton rows to display while loading. */
const SKELETON_ROW_COUNT = 5;

function ActivitySkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading recent activity"
      className="space-y-3"
    >
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5">
          <Skeleton width="72px" height="14px" rounded="rounded-sm" />
          <Skeleton width="80px" height="14px" rounded="rounded-sm" />
          <Skeleton width="60px" height="14px" rounded="rounded-sm" />
          <Skeleton width="120px" height="14px" rounded="rounded-sm" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function ActivityEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Activity className="mb-3 size-8 text-zinc-300" aria-hidden="true" />
      <p className="text-sm text-zinc-500">No recent activity</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * RecentActivitySnapshot renders a "Recent Activity" section on the
 * global dashboard with the last 20 audit events across all projects.
 *
 * Features:
 * - Section heading with Activity icon from Lucide
 * - Chronological list (newest first) of audit events
 * - Each entry: relative timestamp, actor, action, entity, project link
 * - "View all in Audit" footer link
 * - Loading skeleton placeholders
 * - Empty state when no events exist
 */
export function RecentActivitySnapshot() {
  const { data, isLoading } = useDashboardActivity();

  const events = data?.data ?? [];

  return (
    <div data-testid="recent-activity-snapshot">
      {/* Section heading */}
      <div className="mb-4 flex items-center gap-2">
        <Activity className="size-5 text-zinc-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-zinc-900">Recent Activity</h2>
      </div>

      {/* Content area */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="px-4 py-1">
          {isLoading && <ActivitySkeleton />}

          {!isLoading && events.length === 0 && <ActivityEmptyState />}

          {!isLoading && events.length > 0 && (
            <div className="divide-y divide-zinc-100">
              {events.map((event) => (
                <AuditEntry key={event.eventId} event={event} showProject />
              ))}
            </div>
          )}
        </div>

        {/* Footer link */}
        {!isLoading && events.length > 0 && (
          <div className="border-t border-zinc-200 px-4 py-3">
            <Link
              href="/audit"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              View all in Audit
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
