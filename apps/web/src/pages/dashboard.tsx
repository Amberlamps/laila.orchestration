/**
 * Global dashboard page — `/dashboard`
 *
 * Entry point for authenticated users. Conditionally renders:
 * - Empty state when the user has zero projects (onboarding experience)
 * - Full dashboard with KPIs, project grid, activity, and workers table
 *   when the user has one or more projects
 *
 * Layout: AppLayout with `variant="full"` for full-width dashboard.
 * Auth: ProtectedRoute via custom getLayout.
 * Data: TanStack Query `useProjects` hook to determine project count.
 */
import Head from 'next/head';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { ActiveWorkersSummaryTable } from '@/components/dashboard/active-workers-summary-table';
import { DashboardEmptyState } from '@/components/dashboard/dashboard-empty-state';
import { DashboardKpiSummaryRow } from '@/components/dashboard/dashboard-kpi-summary-row';
import { ProjectsAtAGlanceGrid } from '@/components/dashboard/projects-at-a-glance-grid';
import { RecentActivitySnapshot } from '@/components/dashboard/recent-activity-snapshot';
import { AppLayout } from '@/components/layout/app-layout';
import { Skeleton, SkeletonKPICard, SkeletonCard, SkeletonTable } from '@/components/ui/skeleton';
import { useProjects } from '@/lib/query-hooks';

import type { NextPageWithLayout } from './_app';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

/** Number of KPI skeleton cards to show while loading (matches the 5 actual KPI cards). */
const KPI_SKELETON_COUNT = 5;

/** Number of project skeleton cards to show while loading. */
const PROJECT_SKELETON_COUNT = 3;

/**
 * Full-page loading skeleton that matches the dashboard layout structure.
 * Shows KPI cards, project cards, and a table skeleton to minimize CLS.
 */
function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard">
      {/* Page title skeleton */}
      <div className="mb-6">
        <Skeleton width="180px" height="28px" rounded="rounded" />
      </div>

      {/* KPI row skeleton */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: KPI_SKELETON_COUNT }).map((_, i) => (
          <SkeletonKPICard key={i} showBreakdown={i === 0} />
        ))}
      </div>

      {/* Projects grid skeleton */}
      <div className="mb-8">
        <Skeleton width="140px" height="20px" rounded="rounded-sm" className="mb-4" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: PROJECT_SKELETON_COUNT }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>

      {/* Activity / workers table skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <Skeleton width="160px" height="20px" rounded="rounded-sm" className="mb-4" />
          <SkeletonTable columns={3} rows={4} />
        </div>
        <div>
          <Skeleton width="160px" height="20px" rounded="rounded-sm" className="mb-4" />
          <SkeletonTable columns={4} rows={4} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full dashboard (shown when user has 1+ projects)
// ---------------------------------------------------------------------------

/**
 * Composes the four dashboard sections into the full dashboard view.
 * Each section is a standalone component with its own data fetching.
 */
function FullDashboard() {
  return (
    <div>
      {/* Page header */}
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900">Dashboard</h1>

      {/* KPI summary row */}
      <section className="mb-8" aria-label="Key performance indicators">
        <DashboardKpiSummaryRow />
      </section>

      {/* Projects at a glance */}
      <section className="mb-8" aria-label="Projects overview">
        <ProjectsAtAGlanceGrid />
      </section>

      {/* Activity snapshot + Active workers — side by side on large screens */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-label="Recent activity">
          <RecentActivitySnapshot />
        </section>
        <section aria-label="Active workers">
          <ActiveWorkersSummaryTable />
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const DashboardPage: NextPageWithLayout = () => {
  const { data, isLoading } = useProjects({ page: 1, limit: 1 });

  const projectCount = data?.pagination.total ?? 0;
  const hasProjects = projectCount > 0;

  return (
    <>
      <Head>
        <title>Dashboard - laila.works</title>
        <meta name="description" content="AI Agent Orchestration Service — dashboard overview" />
      </Head>

      {isLoading && <DashboardSkeleton />}

      {!isLoading && !hasProjects && <DashboardEmptyState />}

      {!isLoading && hasProjects && <FullDashboard />}
    </>
  );
};

/**
 * Custom layout: wraps in ProtectedRoute + AppLayout with `variant="full"`
 * for full-width dashboard content.
 */
DashboardPage.getLayout = (page: ReactElement) => (
  <ProtectedRoute>
    <AppLayout variant="full">{page}</AppLayout>
  </ProtectedRoute>
);

export default DashboardPage;
