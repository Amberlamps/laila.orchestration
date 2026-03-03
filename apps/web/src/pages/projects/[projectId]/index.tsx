/**
 * Project detail page -- `/projects/{projectId}`
 *
 * Serves as the hub for managing a specific project. Includes:
 * - Header section with project metadata and action buttons
 * - KPI bar with progress, failures, blocked, and cost metrics
 * - Tabbed navigation with shallow routing for sub-views
 *
 * Layout: AppLayout with `variant="constrained"` for detail page.
 * Auth: ProtectedRoute wraps via custom getLayout.
 * Data: TanStack Query `useProject` hook.
 */
import { AlertTriangle, Pencil, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { CreateEditEpicModal } from '@/components/epics/create-edit-epic-modal';
import { AppLayout } from '@/components/layout/app-layout';
import { DeleteProjectButton, DeleteProjectFlow } from '@/components/projects/delete-project-flow';
import { ProjectSettingsTab } from '@/components/projects/project-settings-tab';
import { PublishProjectFlow } from '@/components/projects/publish-project-flow';
import { CreateEditStoryModal } from '@/components/stories/create-edit-story-modal';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { EntityTable } from '@/components/ui/entity-table';
import { KPICard } from '@/components/ui/kpi-card';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { Skeleton, SkeletonKPICard, SkeletonText } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEpics, useProject } from '@/lib/query-hooks';

import type { NextPageWithLayout } from '../../_app';
import type { ColumnDef } from '@/components/ui/entity-table';
import type { WorkStatus } from '@/components/ui/status-badge';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'epics', label: 'Epics' },
  { value: 'stories', label: 'Stories' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'graph', label: 'Graph' },
  { value: 'activity', label: 'Activity' },
  { value: 'settings', label: 'Settings' },
] as const;

/** USD currency formatter */
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps an API WorkStatus to the StatusBadge WorkStatus type.
 *
 * The API schema uses: pending, blocked, ready, in_progress, review, done, failed, skipped
 * The StatusBadge uses: draft, not_started, ready, blocked, in_progress, complete, failed
 */
function mapApiWorkStatus(apiStatus: string): WorkStatus {
  switch (apiStatus) {
    case 'pending':
      return 'not_started';
    case 'blocked':
      return 'blocked';
    case 'ready':
      return 'ready';
    case 'in_progress':
    case 'review':
      return 'in_progress';
    case 'done':
      return 'complete';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'complete';
    default:
      return 'draft';
  }
}

/**
 * Derives a synthetic progress percentage from lifecycle/work status.
 * In production this would use aggregated task completion data from the API.
 */
function deriveProgress(workStatus: string): {
  percent: number;
  breakdown: { done: number; inProgress: number; pending: number };
} {
  switch (workStatus) {
    case 'done':
      return { percent: 100, breakdown: { done: 100, inProgress: 0, pending: 0 } };
    case 'in_progress':
    case 'review':
      return { percent: 45, breakdown: { done: 30, inProgress: 15, pending: 55 } };
    case 'ready':
      return { percent: 10, breakdown: { done: 0, inProgress: 10, pending: 90 } };
    case 'blocked':
      return { percent: 20, breakdown: { done: 15, inProgress: 5, pending: 80 } };
    case 'failed':
      return { percent: 60, breakdown: { done: 40, inProgress: 0, pending: 60 } };
    default:
      return { percent: 0, breakdown: { done: 0, inProgress: 0, pending: 100 } };
  }
}

/**
 * Derives whether the project has in-progress work from child aggregate
 * status counts (stories/epics in progress) rather than top-level workStatus.
 */
function deriveHasInProgressWork(project: Record<string, unknown>): boolean {
  const inProgressStatuses = ['in_progress', 'review'];

  // Check story-level in-progress counts
  const storyCounts = project.storyCounts as Array<{ status: string; count: number }> | undefined;
  if (storyCounts) {
    const inProgressStories = storyCounts
      .filter((c) => inProgressStatuses.includes(c.status))
      .reduce((sum, c) => sum + c.count, 0);
    if (inProgressStories > 0) return true;
  }

  // Check epic-level in-progress counts
  const epicCounts = project.epicCounts as Array<{ status: string; count: number }> | undefined;
  if (epicCounts) {
    const inProgressEpics = epicCounts
      .filter((c) => inProgressStatuses.includes(c.status))
      .reduce((sum, c) => sum + c.count, 0);
    if (inProgressEpics > 0) return true;
  }

  // Fallback to top-level workStatus
  const workStatus = project.workStatus as string;
  return inProgressStatuses.includes(workStatus);
}

/**
 * Derives synthetic failure/blocked counts from work status.
 * In production these would come from aggregated API data.
 */
function deriveMetrics(workStatus: string): { failures: number; blocked: number; cost: number } {
  switch (workStatus) {
    case 'failed':
      return { failures: 3, blocked: 1, cost: 12.5 };
    case 'blocked':
      return { failures: 0, blocked: 2, cost: 8.75 };
    case 'in_progress':
    case 'review':
      return { failures: 1, blocked: 0, cost: 24.3 };
    case 'done':
      return { failures: 0, blocked: 0, cost: 42.0 };
    default:
      return { failures: 0, blocked: 0, cost: 0 };
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Loading skeleton for the entire detail page. */
function DetailSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading project details">
      {/* Breadcrumb skeleton */}
      <div className="mb-4">
        <Skeleton width="180px" height="14px" rounded="rounded-sm" />
      </div>

      {/* Header skeleton */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex-1">
          <Skeleton width="300px" height="30px" rounded="rounded-sm" />
          <div className="mt-2">
            <Skeleton width="80px" height="22px" rounded="rounded-sm" />
          </div>
          <div className="mt-3">
            <SkeletonText lines={2} />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton width="80px" height="36px" rounded="rounded-md" />
          <Skeleton width="36px" height="36px" rounded="rounded-md" />
        </div>
      </div>

      {/* KPI bar skeleton */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SkeletonKPICard showBreakdown />
        <SkeletonKPICard />
        <SkeletonKPICard />
        <SkeletonKPICard />
      </div>

      {/* Tabs skeleton */}
      <div className="mb-4">
        <Skeleton width="100%" height="36px" rounded="rounded-sm" />
      </div>
      <SkeletonText lines={4} />
    </div>
  );
}

/** 404 state when a project is not found. */
function ProjectNotFound() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
        <AlertTriangle className="h-8 w-8 text-zinc-400" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-zinc-900">Project Not Found</h1>
      <p className="mt-2 text-sm text-zinc-500">
        The project you are looking for does not exist or has been deleted.
      </p>
      <Button
        variant="outline"
        className="mt-6"
        onClick={() => {
          void router.push('/projects');
        }}
      >
        Back to Projects
      </Button>
    </div>
  );
}

/** Header section with project name, status, description, and action buttons. */
function ProjectHeader({
  name,
  workStatus,
  lifecycleStatus,
  description,
  projectId,
  entityCounts,
  hasInProgressWork,
}: {
  name: string;
  workStatus: string;
  lifecycleStatus: string;
  description: string | null;
  projectId: string;
  entityCounts: { epics: number; stories: number; tasks: number };
  hasInProgressWork: boolean;
}) {
  const router = useRouter();
  const [publishFlowOpen, setPublishFlowOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const badgeStatus = mapApiWorkStatus(workStatus);
  const isDraft = lifecycleStatus === 'draft' || lifecycleStatus === 'planning';

  function handleEdit() {
    void router.push(`/projects/${projectId}/edit`);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        {/* Left: Name, badge, description */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[30px] leading-tight font-bold text-zinc-900">{name}</h1>
            <StatusBadge status={badgeStatus} />
          </div>

          {description && (
            <div className="mt-2">
              <MarkdownRenderer content={description} className="text-zinc-600" />
            </div>
          )}
        </div>

        {/* Right: Action buttons */}
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={handleEdit}>
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </Button>

          {isDraft && (
            <Button
              onClick={() => {
                setPublishFlowOpen(true);
              }}
            >
              <Send className="size-4" aria-hidden="true" />
              Publish
            </Button>
          )}

          <DeleteProjectButton
            hasInProgressWork={hasInProgressWork}
            onClick={() => {
              setDeleteDialogOpen(true);
            }}
            variant="ghost"
            className="text-red-500 hover:bg-red-50 hover:text-red-600"
            aria-label="Delete project"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </DeleteProjectButton>
        </div>
      </div>

      {/* Publish validation flow */}
      <PublishProjectFlow
        projectId={projectId}
        projectName={name}
        open={publishFlowOpen}
        onClose={() => {
          setPublishFlowOpen(false);
        }}
      />

      {/* Delete confirmation flow */}
      <DeleteProjectFlow
        projectId={projectId}
        projectName={name}
        entityCounts={entityCounts}
        hasInProgressWork={hasInProgressWork}
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
        }}
      />
    </>
  );
}

/** KPI bar showing progress, failures, blocked, and cost metrics. */
function KPIBar({ workStatus }: { workStatus: string }) {
  const progress = deriveProgress(workStatus);
  const metrics = deriveMetrics(workStatus);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Progress % */}
      <KPICard
        value={`${String(progress.percent)}%`}
        label="Progress"
        accentColor="border-green-500"
        breakdown={[
          { status: 'Done', value: progress.breakdown.done, color: 'bg-green-500' },
          { status: 'In Progress', value: progress.breakdown.inProgress, color: 'bg-blue-500' },
          { status: 'Pending', value: progress.breakdown.pending, color: 'bg-zinc-200' },
        ]}
      />

      {/* Failures */}
      <KPICard value={metrics.failures} label="Failures" accentColor="border-red-500" />

      {/* Blocked */}
      <KPICard value={metrics.blocked} label="Blocked" accentColor="border-amber-500" />

      {/* Cost */}
      <KPICard
        value={currencyFormatter.format(metrics.cost)}
        label="Total Cost"
        accentColor="border-indigo-500"
        className="[&_.text-display]:font-mono"
      />
    </div>
  );
}

/**
 * Timeout reclamation banner for workers approaching inactivity timeout.
 *
 * Shows an amber warning when the project has workers nearing timeout
 * based on the project work status. When the project is actively in
 * progress, this banner informs users about the timeout reclamation
 * mechanism.
 */
function TimeoutBanner({
  workStatus,
  workerInactivityTimeoutMinutes,
}: {
  workStatus: string;
  workerInactivityTimeoutMinutes?: number;
}) {
  const isActive = workStatus === 'in_progress' || workStatus === 'review';

  if (!isActive) {
    return <></>;
  }

  const timeoutMinutes = workerInactivityTimeoutMinutes ?? 30;

  return (
    <div
      className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
      role="status"
      aria-label="Worker timeout information"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-amber-800">Worker Inactivity Timeout Active</p>
        <p className="mt-1 text-[13px] text-amber-700">
          Workers assigned to this project will be automatically unassigned after{' '}
          {String(timeoutMinutes)} minutes of inactivity. Monitor the Activity tab for workers
          approaching the timeout threshold.
        </p>
      </div>
    </div>
  );
}

/** Overview tab content showing a summary dashboard. */
function OverviewTabContent({ name }: { name: string }) {
  return (
    <div className="space-y-6 py-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-zinc-900">Project Summary</h3>
        <p className="mt-2 text-sm text-zinc-600">
          Overview dashboard for {name}. This section will display recent activity, status
          distribution charts, and key metrics summary.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h4 className="text-sm font-semibold text-zinc-900">Recent Activity</h4>
          <p className="mt-2 text-sm text-zinc-500">No recent activity to display.</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h4 className="text-sm font-semibold text-zinc-900">Status Distribution</h4>
          <p className="mt-2 text-sm text-zinc-500">Status chart will be rendered here.</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Epic row type for the Epics tab table
// ---------------------------------------------------------------------------

interface EpicRow {
  id: string;
  name: string;
  workStatus: string;
  storyCount?: number;
}

/** Epics tab content with entity table and "+ Add Epic" create modal trigger. */
function EpicsTabContent({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const queryParams: Record<string, unknown> = { page, limit: 20 };
  if (sortBy) {
    queryParams.sortBy = sortBy;
    queryParams.sortOrder = sortDirection;
  }

  const { data: epicsData, isLoading } = useEpics(projectId, queryParams);
  const epics: EpicRow[] = (epicsData?.data ?? []) as EpicRow[];
  const totalCount = epicsData?.pagination.total ?? epics.length;

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDirection('asc');
    }
  };

  const epicColumns: ColumnDef<EpicRow>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (row) => (
        <Link
          href={`/projects/${projectId}/epics/${row.id}`}
          className="font-medium text-indigo-600 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {row.name}
        </Link>
      ),
      width: '50%',
    },
    {
      key: 'workStatus',
      header: 'Status',
      sortable: true,
      cell: (row) => <StatusBadge status={mapApiWorkStatus(row.workStatus)} />,
    },
  ];

  return (
    <div className="space-y-4 py-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-900">Epics</h3>
        <Button
          onClick={() => {
            setCreateModalOpen(true);
          }}
        >
          + Add Epic
        </Button>
      </div>

      <EntityTable<EpicRow>
        columns={epicColumns}
        data={epics}
        getRowKey={(row) => row.id}
        loading={isLoading}
        page={page}
        pageSize={20}
        totalCount={totalCount}
        onPageChange={setPage}
        onSort={handleSort}
        {...(sortBy != null ? { sortBy, sortDirection } : {})}
        onRowClick={(row) => {
          void router.push(`/projects/${projectId}/epics/${row.id}`);
        }}
        emptyState={
          <EmptyState
            icon={(props: { className?: string }) => <AlertTriangle {...props} />}
            title="No Epics Yet"
            description="This project doesn't have any epics. Create an epic to get started."
            actionLabel="+ Add Epic"
            onAction={() => {
              setCreateModalOpen(true);
            }}
          />
        }
      />

      <CreateEditEpicModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        projectId={projectId}
      />
    </div>
  );
}

/** Placeholder content for tabs that are not yet implemented. */
function PlaceholderTabContent({ tabLabel }: { tabLabel: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <p className="text-sm text-zinc-500">
        {tabLabel} tab content will be implemented in a future update.
      </p>
    </div>
  );
}

/**
 * Stories tab content for the project detail page.
 * Shows a create button and explains stories are organized by epic.
 */
function StoriesTabContent({
  projectId,
  onCreateStory,
}: {
  projectId: string;
  onCreateStory: () => void;
}) {
  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Stories</h2>
        <Button onClick={onCreateStory}>+ Create Story</Button>
      </div>
      <EmptyState
        icon={(props: { className?: string }) => (
          <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
            />
          </svg>
        )}
        title="Stories are organized by epic"
        description={`Navigate to an epic to view its stories, or create a new story using the button above.`}
        actionLabel="View Epics"
        onAction={() => {
          // Switch to the epics tab — use the parent's tab handler via query param
          const url = `/projects/${projectId}?tab=epics`;
          window.location.href = url;
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const ProjectDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const tabParam = router.query.tab;
  const activeTab = typeof tabParam === 'string' ? tabParam : 'overview';
  const [createStoryModalOpen, setCreateStoryModalOpen] = useState(false);

  const { data, isLoading, isError } = useProject(projectId);
  const project = data?.data;

  /**
   * Handle tab change with shallow routing to avoid full page reload.
   * URL updates to /projects/{id}?tab=epics without re-running data fetching.
   */
  function handleTabChange(tab: string) {
    void router.push({ pathname: router.pathname, query: { projectId, tab } }, undefined, {
      shallow: true,
    });
  }

  // Loading state
  if (isLoading || !router.isReady) {
    return <DetailSkeleton />;
  }

  // 404 state
  if (isError || !project) {
    return <ProjectNotFound />;
  }

  const breadcrumbItems = [{ label: 'Projects', href: '/projects' }, { label: project.name }];

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} className="mb-4" />

      {/* Header */}
      <ProjectHeader
        name={project.name}
        workStatus={project.workStatus}
        lifecycleStatus={project.lifecycleStatus}
        description={project.description}
        projectId={project.id}
        entityCounts={{
          epics: ((project as Record<string, unknown>).totalEpics as number | undefined) ?? 0,
          stories: ((project as Record<string, unknown>).totalStories as number | undefined) ?? 0,
          tasks: ((project as Record<string, unknown>).totalTasks as number | undefined) ?? 0,
        }}
        hasInProgressWork={deriveHasInProgressWork(project as Record<string, unknown>)}
      />

      {/* Timeout reclamation banners */}
      <TimeoutBanner
        workStatus={project.workStatus}
        {...(typeof (project as Record<string, unknown>).workerInactivityTimeoutMinutes === 'number'
          ? {
              workerInactivityTimeoutMinutes: (project as Record<string, unknown>)
                .workerInactivityTimeoutMinutes as number,
            }
          : {})}
      />

      {/* KPI Bar */}
      <div className="mt-8 mb-8">
        <KPIBar workStatus={project.workStatus} />
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full">
          {PROJECT_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <OverviewTabContent name={project.name} />
        </TabsContent>

        <TabsContent value="epics">
          <EpicsTabContent projectId={project.id} />
        </TabsContent>

        <TabsContent value="stories">
          <StoriesTabContent
            projectId={project.id}
            onCreateStory={() => {
              setCreateStoryModalOpen(true);
            }}
          />
        </TabsContent>

        <TabsContent value="tasks">
          <PlaceholderTabContent tabLabel="Tasks" />
        </TabsContent>

        <TabsContent value="graph">
          <PlaceholderTabContent tabLabel="Graph" />
        </TabsContent>

        <TabsContent value="activity">
          <PlaceholderTabContent tabLabel="Activity" />
        </TabsContent>

        <TabsContent value="settings">
          <ProjectSettingsTab
            project={{
              ...project,
              workerInactivityTimeoutMinutes: (project as Record<string, unknown>)
                .workerInactivityTimeoutMinutes as number | undefined,
              totalEpics: (project as Record<string, unknown>).totalEpics as number | undefined,
              totalStories: (project as Record<string, unknown>).totalStories as number | undefined,
              totalTasks: (project as Record<string, unknown>).totalTasks as number | undefined,
              storyCounts: (project as Record<string, unknown>).storyCounts as
                | Array<{ status: string; count: number }>
                | undefined,
              epicCounts: (project as Record<string, unknown>).epicCounts as
                | Array<{ status: string; count: number }>
                | undefined,
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Create story modal (no pre-selected epic at project level) */}
      <CreateEditStoryModal
        open={createStoryModalOpen}
        onOpenChange={setCreateStoryModalOpen}
        projectId={project.id}
      />
    </div>
  );
};

/**
 * Custom layout: wraps in ProtectedRoute + AppLayout with `variant="constrained"`
 * for detail page content width. Overrides the default layout.
 */
ProjectDetailPage.getLayout = (page: ReactElement) => (
  <ProtectedRoute>
    <AppLayout variant="constrained">{page}</AppLayout>
  </ProtectedRoute>
);

export default ProjectDetailPage;
