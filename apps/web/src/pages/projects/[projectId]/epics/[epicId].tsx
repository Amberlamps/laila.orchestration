/**
 * Epic detail page -- `/projects/{projectId}/epics/{epicId}`
 *
 * Displays a single epic with:
 * - Breadcrumb navigation: Projects > {Project Name} > Epics > {Epic Title}
 * - Header with title, status badges, and action buttons
 * - Markdown description (max-width 720px)
 * - Progress stat cards (Complete, In Progress, Blocked, Not Started)
 * - Implicit dependencies section (hidden if none)
 * - User stories table via EntityTable
 *
 * Layout: AppLayout with `variant="constrained"`.
 * Auth: ProtectedRoute wraps via custom getLayout.
 * Data: TanStack Query `useEpic` + `useStories` hooks.
 */
import { AlertTriangle, BookOpen, Pencil, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { CreateEditEpicModal } from '@/components/epics/create-edit-epic-modal';
import { DeleteEpicButton, DeleteEpicFlow } from '@/components/epics/delete-epic-flow';
import { PublishEpicFlow } from '@/components/epics/publish-epic-flow';
import { AppLayout } from '@/components/layout/app-layout';
import { CreateEditStoryModal } from '@/components/stories/create-edit-story-modal';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { EntityTable } from '@/components/ui/entity-table';
import { KPICard } from '@/components/ui/kpi-card';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { Skeleton, SkeletonKPICard, SkeletonTable, SkeletonText } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { useEpic, useEpicCounts, useProject, useStories, useWorkers } from '@/lib/query-hooks';

import type { NextPageWithLayout } from '../../../_app';
import type { ColumnDef } from '@/components/ui/entity-table';
import type { WorkStatus } from '@/components/ui/status-badge';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoryRow {
  id: string;
  title: string;
  priority: string;
  workStatus: string;
  assignedWorkerId: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

/** Maps API priority values to display labels and colors. */
const PRIORITY_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  critical: { label: 'Critical', bg: 'bg-red-50', text: 'text-red-700' },
  high: { label: 'High', bg: 'bg-red-50', text: 'text-red-700' },
  medium: { label: 'Medium', bg: 'bg-amber-50', text: 'text-amber-700' },
  low: { label: 'Low', bg: 'bg-green-50', text: 'text-green-700' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps an API WorkStatus to the StatusBadge WorkStatus type.
 *
 * The API uses: pending, blocked, ready, in_progress, review, done, failed, skipped
 * The StatusBadge uses: draft, not_started, ready, blocked, in_progress, complete, failed
 */
const mapApiWorkStatus = (apiStatus: string): WorkStatus => {
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
};

/**
 * Determines if an epic is in "draft" state.
 * Since epics don't have a lifecycleStatus, we treat `pending` workStatus as draft.
 */
const isEpicDraft = (workStatus: string): boolean => workStatus === 'pending';

/**
 * Counts stories by their work status category.
 * Returns counts for Complete, In Progress, Blocked, and Not Started.
 */
const computeStoryCounts = (
  stories: StoryRow[],
): { complete: number; inProgress: number; blocked: number; notStarted: number } => {
  let complete = 0;
  let inProgress = 0;
  let blocked = 0;
  let notStarted = 0;

  for (const story of stories) {
    switch (story.workStatus) {
      case 'done':
      case 'skipped':
        complete++;
        break;
      case 'in_progress':
      case 'review':
        inProgress++;
        break;
      case 'blocked':
        blocked++;
        break;
      case 'pending':
      case 'ready':
      default:
        notStarted++;
        break;
    }
  }

  return { complete, inProgress, blocked, notStarted };
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Loading skeleton for the epic detail page. */
const DetailSkeleton = () => (
  <div role="status" aria-live="polite" aria-label="Loading epic details">
    {/* Breadcrumb skeleton */}
    <div className="mb-4">
      <Skeleton width="260px" height="14px" rounded="rounded-sm" />
    </div>

    {/* Header skeleton */}
    <div className="mb-6 flex items-start justify-between">
      <div className="flex-1">
        <Skeleton width="300px" height="28px" rounded="rounded-sm" />
        <div className="mt-2 flex gap-2">
          <Skeleton width="80px" height="22px" rounded="rounded-sm" />
          <Skeleton width="80px" height="22px" rounded="rounded-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton width="80px" height="36px" rounded="rounded-md" />
        <Skeleton width="80px" height="36px" rounded="rounded-md" />
        <Skeleton width="36px" height="36px" rounded="rounded-md" />
      </div>
    </div>

    {/* Description skeleton */}
    <div className="mb-8">
      <SkeletonText lines={3} />
    </div>

    {/* KPI cards skeleton */}
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SkeletonKPICard />
      <SkeletonKPICard />
      <SkeletonKPICard />
      <SkeletonKPICard />
    </div>

    {/* Table skeleton */}
    <SkeletonTable columns={4} rows={5} />
  </div>
);

/** 404 state when an epic is not found. */
const EpicNotFound = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
        <AlertTriangle className="h-8 w-8 text-zinc-400" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-zinc-900">Epic Not Found</h1>
      <p className="mt-2 text-sm text-zinc-500">
        The epic you are looking for does not exist or has been deleted.
      </p>
      <Button
        variant="outline"
        className="mt-6"
        onClick={() => {
          void router.push(`/projects/${projectId}`);
        }}
      >
        Back to Project
      </Button>
    </div>
  );
};

/** Header section with epic title, status badges, and action buttons. */
const EpicHeader = ({
  name,
  workStatus,
  hasInProgressWork,
  onEditClick,
  onPublishClick,
  onDeleteClick,
}: {
  name: string;
  workStatus: string;
  hasInProgressWork: boolean;
  onEditClick: () => void;
  onPublishClick: () => void;
  onDeleteClick: () => void;
}) => {
  const badgeStatus = mapApiWorkStatus(workStatus);
  const isDraft = isEpicDraft(workStatus);

  return (
    <div className="flex items-start justify-between gap-4">
      {/* Left: Title and badges */}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold text-zinc-900">{name}</h1>
        <div className="mt-2 flex items-center gap-2">
          {isDraft && <StatusBadge status="draft" />}
          <StatusBadge status={badgeStatus} />
        </div>
      </div>

      {/* Right: Action buttons */}
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" onClick={onEditClick}>
          <Pencil className="size-4" aria-hidden="true" />
          Edit
        </Button>

        {isDraft && (
          <Button onClick={onPublishClick}>
            <Send className="size-4" aria-hidden="true" />
            Publish
          </Button>
        )}

        <DeleteEpicButton
          hasInProgressWork={hasInProgressWork}
          onClick={onDeleteClick}
          variant="ghost"
          className="text-red-500 hover:bg-red-50 hover:text-red-600"
          aria-label="Delete epic"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </DeleteEpicButton>
      </div>
    </div>
  );
};

/** Progress stat cards showing story breakdown by status. */
const ProgressCards = ({ stories }: { stories: StoryRow[] }) => {
  const counts = computeStoryCounts(stories);
  const total = stories.length;
  const completePercent = total > 0 ? Math.round((counts.complete / total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KPICard
        value={`${String(counts.complete)} (${String(completePercent)}%)`}
        label="Complete"
        accentColor="border-green-500"
      />
      <KPICard value={counts.inProgress} label="In Progress" accentColor="border-blue-500" />
      <KPICard value={counts.blocked} label="Blocked" accentColor="border-amber-500" />
      <KPICard value={counts.notStarted} label="Not Started" accentColor="border-zinc-400" />
    </div>
  );
};

/** Priority badge component for the stories table. */
const PriorityBadge = ({ priority }: { priority: string }) => {
  const config = PRIORITY_CONFIG[priority] ?? {
    label: priority,
    bg: 'bg-zinc-100',
    text: 'text-zinc-600',
  };

  return (
    <span
      className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
    >
      {config.label}
    </span>
  );
};

/** Implicit dependencies section showing cross-epic dependencies. */
const DependenciesSection = ({
  dependencies,
  projectId,
}: {
  dependencies: Array<{ epicId: string; epicName: string }>;
  projectId: string;
}) => {
  if (dependencies.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-zinc-900">Implicit Dependencies</h2>
      <p className="mt-1 text-sm text-zinc-500">
        These epics have cross-epic task dependencies with this epic.
      </p>
      <ul className="mt-3 space-y-2">
        {dependencies.map((dep) => (
          <li key={dep.epicId} className="flex items-center gap-2 text-sm">
            <span className="size-1.5 rounded-full bg-zinc-400" aria-hidden="true" />
            <Link
              href={`/projects/${projectId}/epics/${dep.epicId}`}
              className="text-indigo-600 hover:underline"
            >
              {dep.epicName}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const EpicDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const epicId = router.query.epicId as string;

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [publishFlowOpen, setPublishFlowOpen] = useState(false);
  const [deleteFlowOpen, setDeleteFlowOpen] = useState(false);
  const [createStoryModalOpen, setCreateStoryModalOpen] = useState(false);

  // Fetch epic detail
  const {
    data: epicData,
    isLoading: epicLoading,
    isError: epicError,
    refetch: refetchEpic,
  } = useEpic(epicId);
  const epic = epicData?.data;

  // Fetch project for breadcrumb project name
  const { data: projectData } = useProject(projectId);
  const project = projectData?.data;

  // Fetch authoritative aggregate counts for delete guard and confirmation dialog
  const { data: epicCounts } = useEpicCounts(projectId, epicId);

  // Fetch workers for name resolution in the stories table
  const { data: workersData } = useWorkers();
  const workerLookup = new Map<string, string>();
  if (workersData?.data) {
    for (const worker of workersData.data as Array<{ id: string; name: string }>) {
      workerLookup.set(worker.id, worker.name);
    }
  }

  // Fetch stories for this epic
  const queryParams: Record<string, unknown> = {
    page,
    limit: PAGE_SIZE,
  };
  if (sortBy) {
    queryParams.sortBy = sortBy;
    queryParams.sortOrder = sortDirection;
  }
  const { data: storiesData, isLoading: storiesLoading } = useStories(epicId, queryParams);
  const stories: StoryRow[] = (storiesData?.data ?? []) as StoryRow[];
  const totalCount = storiesData?.pagination.total ?? stories.length;

  // Handle sort toggle
  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDirection('asc');
    }
  };

  // Loading state
  if (epicLoading || !router.isReady) {
    return <DetailSkeleton />;
  }

  // 404 state
  if (epicError || !epic) {
    return <EpicNotFound />;
  }

  // Derive implicit dependencies from epic data (if the API provides them)
  const epicRecord = epic as Record<string, unknown>;
  const implicitDependencies = (
    Array.isArray(epicRecord.implicitDependencies) ? epicRecord.implicitDependencies : []
  ) as Array<{ epicId: string; epicName: string }>;

  // Use authoritative API-provided counts for delete guard and confirmation dialog
  const hasInProgressWork = epicCounts?.hasInProgressWork ?? false;
  const storyCount = epicCounts?.totalStories ?? 0;
  const taskCount = epicCounts?.totalTasks ?? 0;

  // Breadcrumb items
  const breadcrumbItems = [
    { label: 'Projects', href: '/projects' },
    { label: project?.name ?? 'Project', href: `/projects/${projectId}` },
    { label: 'Epics', href: `/projects/${projectId}?tab=epics` },
    { label: epic.name },
  ];

  // Story table column definitions
  const storyColumns: ColumnDef<StoryRow>[] = [
    {
      key: 'title',
      header: 'Title',
      cell: (row) => (
        <Link
          href={`/projects/${projectId}/stories/${row.id}`}
          className="font-medium text-indigo-600 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {row.title}
        </Link>
      ),
      width: '40%',
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      cell: (row) => <PriorityBadge priority={row.priority} />,
    },
    {
      key: 'workStatus',
      header: 'Work Status',
      sortable: true,
      cell: (row) => <StatusBadge status={mapApiWorkStatus(row.workStatus)} />,
    },
    {
      key: 'assignedWorkerId',
      header: 'Assigned Worker',
      cell: (row) => {
        const workerName = row.assignedWorkerId
          ? (workerLookup.get(row.assignedWorkerId) ?? null)
          : null;
        return (
          <span className={workerName ? 'text-zinc-900' : 'text-zinc-400'}>
            {workerName ?? 'Unassigned'}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} className="mb-4" />

      {/* Header */}
      <EpicHeader
        name={epic.name}
        workStatus={epic.workStatus}
        hasInProgressWork={hasInProgressWork}
        onEditClick={() => {
          setEditModalOpen(true);
        }}
        onPublishClick={() => {
          setPublishFlowOpen(true);
        }}
        onDeleteClick={() => {
          setDeleteFlowOpen(true);
        }}
      />

      {/* Edit Epic Modal */}
      <CreateEditEpicModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        projectId={projectId}
        epic={{
          id: epic.id,
          name: epic.name,
          description: epic.description,
          version: epic.version,
        }}
      />

      {/* Publish Epic Flow */}
      <PublishEpicFlow
        projectId={projectId}
        epicId={epicId}
        epicName={epic.name}
        open={publishFlowOpen}
        onClose={() => {
          setPublishFlowOpen(false);
        }}
        onPublished={() => {
          void refetchEpic();
        }}
      />

      {/* Delete Epic Flow */}
      <DeleteEpicFlow
        projectId={projectId}
        epicId={epicId}
        epicName={epic.name}
        entityCounts={{ stories: storyCount, tasks: taskCount }}
        hasInProgressWork={hasInProgressWork}
        open={deleteFlowOpen}
        onClose={() => {
          setDeleteFlowOpen(false);
        }}
      />

      {/* Description */}
      {epic.description && (
        <div className="mt-6 max-w-[720px]">
          <MarkdownRenderer content={epic.description} />
        </div>
      )}

      {/* Progress stat cards */}
      <div className="mt-8">
        <ProgressCards stories={stories} />
      </div>

      {/* Implicit dependencies */}
      <DependenciesSection dependencies={implicitDependencies} projectId={projectId} />

      {/* User stories section */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">User Stories</h2>
          <Button
            onClick={() => {
              setCreateStoryModalOpen(true);
            }}
          >
            + Add Story
          </Button>
        </div>

        <EntityTable<StoryRow>
          columns={storyColumns}
          data={stories}
          getRowKey={(row) => row.id}
          loading={storiesLoading}
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          onPageChange={setPage}
          onSort={handleSort}
          {...(sortBy != null ? { sortBy, sortDirection } : {})}
          onRowClick={(row) => {
            void router.push(`/projects/${projectId}/stories/${row.id}`);
          }}
          emptyState={
            <EmptyState
              icon={(props: { className?: string }) => <BookOpen {...props} />}
              title="No Stories Yet"
              description="This epic doesn't have any user stories. Add a story to get started."
              actionLabel="+ Add Story"
              onAction={() => {
                setCreateStoryModalOpen(true);
              }}
            />
          }
        />
      </div>

      {/* Create story modal (pre-selected to this epic) */}
      <CreateEditStoryModal
        open={createStoryModalOpen}
        onOpenChange={setCreateStoryModalOpen}
        projectId={projectId}
        epicId={epicId}
      />
    </div>
  );
};

/**
 * Custom layout: wraps in ProtectedRoute + AppLayout with `variant="constrained"`
 * for detail page content width.
 */
EpicDetailPage.getLayout = (page: ReactElement) => (
  <ProtectedRoute>
    <AppLayout variant="constrained">{page}</AppLayout>
  </ProtectedRoute>
);

export default EpicDetailPage;
