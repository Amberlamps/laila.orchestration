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
import { useRouter } from 'next/router';
import { useState } from 'react';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { DeleteProjectButton, DeleteProjectFlow } from '@/components/projects/delete-project-flow';
import { ProjectSettingsTab } from '@/components/projects/project-settings-tab';
import { PublishProjectFlow } from '@/components/projects/publish-project-flow';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { KPICard } from '@/components/ui/kpi-card';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { Skeleton, SkeletonKPICard, SkeletonText } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProject } from '@/lib/query-hooks';

import type { NextPageWithLayout } from '../../_app';
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
}: {
  name: string;
  workStatus: string;
  lifecycleStatus: string;
  description: string | null;
  projectId: string;
  entityCounts: { epics: number; stories: number; tasks: number };
}) {
  const router = useRouter();
  const [publishFlowOpen, setPublishFlowOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const badgeStatus = mapApiWorkStatus(workStatus);
  const isDraft = lifecycleStatus === 'draft' || lifecycleStatus === 'planning';
  const hasInProgressWork = workStatus === 'in_progress' || workStatus === 'review';

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

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const ProjectDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const tabParam = router.query.tab;
  const activeTab = typeof tabParam === 'string' ? tabParam : 'overview';

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
          epics: ((project as Record<string, unknown>).totalEpics as number) ?? 0,
          stories: ((project as Record<string, unknown>).totalStories as number) ?? 0,
          tasks: ((project as Record<string, unknown>).totalTasks as number) ?? 0,
        }}
      />

      {/* Timeout reclamation banners */}
      <TimeoutBanner
        workStatus={project.workStatus}
        workerInactivityTimeoutMinutes={
          (project as Record<string, unknown>).workerInactivityTimeoutMinutes as number | undefined
        }
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
          <PlaceholderTabContent tabLabel="Epics" />
        </TabsContent>

        <TabsContent value="stories">
          <PlaceholderTabContent tabLabel="Stories" />
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
          <ProjectSettingsTab project={project} />
        </TabsContent>
      </Tabs>
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
