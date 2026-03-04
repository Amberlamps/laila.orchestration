/**
 * ProjectsAtAGlanceGrid — Responsive grid container for project summary cards.
 *
 * Fetches the project list from the API using TanStack Query and displays
 * up to 12 project cards in a responsive grid layout.
 *
 * Grid layout:
 * - Desktop (>= 1024px): 3 columns — grid-cols-3
 * - Tablet (>= 768px): 2 columns — grid-cols-2
 * - Mobile (< 768px): 1 column — grid-cols-1
 *
 * Gap: gap-4 (16px)
 * Section heading: "Projects" with count badge
 *
 * If more than 12 projects exist, shows first 12 with a "View all projects" link
 * to the full projects list page.
 */
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/ui/skeleton';
import { useProjects } from '@/lib/query-hooks';

import { ProjectSummaryCard } from './project-summary-card';

import type { ProjectSummaryData } from './project-summary-card';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of project cards to display on the dashboard. */
const MAX_DISPLAY_COUNT = 12;

/** Number of skeleton cards shown during loading. */
const SKELETON_COUNT = 6;

// ---------------------------------------------------------------------------
// Data transformation
// ---------------------------------------------------------------------------

/**
 * Reads a numeric summary field from the API project response.
 * Summary fields (completionPercentage, failureCount, etc.) are included
 * when the API is called with `include_summary: true`. Defaults to 0 when
 * the field is absent or not a number.
 */
function readNumericField(project: Record<string, unknown>, key: string): number {
  const value: unknown = project[key];
  return typeof value === 'number' ? value : 0;
}

/**
 * Transforms a raw project from the API into the ProjectSummaryData shape
 * expected by ProjectSummaryCard.
 *
 * Relies on summary-projection fields returned by the API when fetched
 * with `include_summary: true`. Missing fields default to 0.
 */
function toProjectSummary(
  project: Record<string, unknown> & {
    id: string;
    name: string;
    workStatus: string;
    lifecycleStatus: string;
  },
): ProjectSummaryData {
  return {
    id: project.id,
    name: project.name,
    workStatus: project.workStatus,
    lifecycleStatus: project.lifecycleStatus,
    completionPercentage: readNumericField(project, 'completionPercentage'),
    failureCount: readNumericField(project, 'failureCount'),
    blockedCount: readNumericField(project, 'blockedCount'),
    activeWorkerCount: readNumericField(project, 'activeWorkerCount'),
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Loading skeleton grid matching the responsive layout. */
function LoadingSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Loading projects"
    >
      {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * ProjectsAtAGlanceGrid fetches and displays a grid of project summary cards.
 *
 * Uses the existing `useProjects` hook with a limit of 12 to retrieve the
 * most recently updated projects. The total count from pagination metadata
 * determines whether a "View all projects" link is shown.
 */
function ProjectsAtAGlanceGrid() {
  const { data, isLoading } = useProjects({
    page: 1,
    limit: MAX_DISPLAY_COUNT,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    include_summary: true,
  });

  const projects = data?.data ?? [];
  const totalCount = data?.pagination.total ?? 0;
  const hasMore = totalCount > MAX_DISPLAY_COUNT;

  // Transform API data to summary card format
  const summaries: ProjectSummaryData[] = projects
    .slice(0, MAX_DISPLAY_COUNT)
    .map((project) => toProjectSummary(project as Record<string, unknown> & typeof project));

  return (
    <section aria-labelledby="projects-grid-heading">
      {/* Section heading with count badge */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 id="projects-grid-heading" className="text-lg font-semibold text-zinc-900">
            Projects
          </h2>
          {!isLoading && (
            <Badge variant="secondary" className="tabular-nums">
              {String(totalCount)}
            </Badge>
          )}
        </div>

        {/* "View all projects" link when more exist */}
        {hasMore && (
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700"
          >
            View all projects
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>

      {/* Loading state */}
      {isLoading && <LoadingSkeleton />}

      {/* Project cards grid */}
      {!isLoading && summaries.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary) => (
            <ProjectSummaryCard key={summary.id} project={summary} />
          ))}
        </div>
      )}
    </section>
  );
}

export { ProjectsAtAGlanceGrid };
