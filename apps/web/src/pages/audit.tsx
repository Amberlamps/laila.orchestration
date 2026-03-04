/**
 * Cross-project audit log page -- `/audit`
 *
 * Displays all audit events across all projects in strict chronological
 * order (newest first). Uses cursor-based pagination with a "Load More"
 * button backed by TanStack Query's `useInfiniteQuery`.
 *
 * Layout: AppLayout with `variant="full"` for full-width event list.
 * Auth: ProtectedRoute wraps via custom getLayout.
 * Data: `useInfiniteQuery` with cursor-based pagination against the
 *   `/api/v1/audit-events` endpoint.
 */
import { useInfiniteQuery } from '@tanstack/react-query';
import { Loader2, ScrollText } from 'lucide-react';
import Head from 'next/head';

import { AuditEntry } from '@/components/audit/audit-entry';
import { AuditExportButton } from '@/components/audit/audit-export-button';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';

import type { NextPageWithLayout } from './_app';
import type { AuditEntryEvent } from '@/components/audit/audit-entry';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of events to fetch per page. */
const PAGE_SIZE = 50;

/** Number of skeleton rows to display during initial load. */
const SKELETON_ROW_COUNT = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Response shape from GET /api/v1/audit-events. */
interface AuditEventsResponse {
  events: AuditEntryEvent[];
  lastEvaluatedKey?: string;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetches audit events with cursor-based pagination.
 *
 * Uses raw `fetch` because the audit events endpoint is not part of the
 * OpenAPI spec (so `apiClient` from openapi-fetch cannot type it).
 */
async function fetchAuditEvents(cursor: string | undefined): Promise<AuditEventsResponse> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) {
    params.set('cursor', cursor);
  }

  const response = await fetch(`/api/v1/audit-events?${params.toString()}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch audit events: ${String(response.status)}`);
  }

  return response.json() as Promise<AuditEventsResponse>;
}

/**
 * TanStack Query infinite query hook for paginated audit events.
 *
 * Uses cursor-based pagination with DynamoDB's lastEvaluatedKey.
 * Each page contains up to 50 events sorted newest first.
 */
function useAuditEvents() {
  return useInfiniteQuery({
    queryKey: queryKeys.audit.all(),
    queryFn: ({ pageParam }) => fetchAuditEvents(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.lastEvaluatedKey,
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Breadcrumb navigation for the audit log page. */
function AuditBreadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex items-center gap-1.5 text-sm text-zinc-500">
        <li>
          <a href="/dashboard" className="hover:text-zinc-700">
            Home
          </a>
        </li>
        <li aria-hidden="true" className="text-zinc-300">
          /
        </li>
        <li className="font-medium text-zinc-900">Audit Log</li>
      </ol>
    </nav>
  );
}

/** Loading skeleton matching the AuditEntry row layout. */
function AuditEntrySkeleton() {
  return (
    <div className="flex items-start gap-3 border-b border-zinc-100 py-2.5">
      {/* Timestamp placeholder */}
      <div className="w-[100px] flex-shrink-0">
        <Skeleton width="70px" height="14px" rounded="rounded-sm" />
      </div>
      {/* Actor placeholder */}
      <div className="w-[120px] flex-shrink-0">
        <Skeleton width="90px" height="14px" rounded="rounded-sm" />
      </div>
      {/* Action + target placeholder */}
      <div className="min-w-0 flex-1">
        <Skeleton width="60%" height="14px" rounded="rounded-sm" />
      </div>
      {/* Project placeholder */}
      <div className="w-[140px] flex-shrink-0 text-right">
        <Skeleton width="80px" height="14px" rounded="rounded-sm" className="ml-auto" />
      </div>
    </div>
  );
}

/** Loading state: 10 skeleton rows matching the AuditEntry layout. */
function LoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading audit events">
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
        <AuditEntrySkeleton key={i} />
      ))}
    </div>
  );
}

/** Empty state when no audit events exist. */
function EmptyState() {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-6">
      <ScrollText className="size-12 text-zinc-300" aria-hidden="true" />
      <h3 className="text-lg font-semibold text-zinc-900">No audit events recorded</h3>
      <p className="max-w-[400px] text-center text-sm text-zinc-500">
        Events will appear here as changes are made across your projects.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const AuditLogPage: NextPageWithLayout = () => {
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useAuditEvents();

  const allEvents = data?.pages.flatMap((page) => page.events) ?? [];

  const handleLoadMore = () => {
    void fetchNextPage();
  };

  return (
    <>
      <Head>
        <title>Audit Log - laila.works</title>
        <meta name="description" content="Cross-project audit log — all events, newest first" />
      </Head>

      {/* Breadcrumb */}
      <AuditBreadcrumb />

      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="size-6 text-zinc-700" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Audit Log</h1>
        </div>
        <AuditExportButton events={allEvents} filename="audit-log" />
      </div>

      {/* Loading state */}
      {isLoading && <LoadingSkeleton />}

      {/* Empty state */}
      {!isLoading && allEvents.length === 0 && <EmptyState />}

      {/* Event list */}
      {!isLoading && allEvents.length > 0 && (
        <>
          <div className="rounded-md border border-zinc-200 bg-white">
            {allEvents.map((event) => (
              <AuditEntry key={event.eventId} event={event} showProject />
            ))}
          </div>

          {/* Load More button */}
          {hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button variant="ghost" onClick={handleLoadMore} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Loading...
                  </>
                ) : (
                  'Load More'
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
};

/**
 * Custom layout: wraps in ProtectedRoute + AppLayout with `variant="full"`
 * for full-width audit log layout.
 */
AuditLogPage.getLayout = (page: ReactElement) => (
  <ProtectedRoute>
    <AppLayout variant="full">{page}</AppLayout>
  </ProtectedRoute>
);

export default AuditLogPage;
