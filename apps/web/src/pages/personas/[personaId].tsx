/**
 * Persona detail page -- `/personas/{personaId}`
 *
 * Displays a single persona with:
 * - Breadcrumb navigation: Personas > {Persona Title}
 * - Header with title, persona ID in monospace, and action buttons (Edit / Delete)
 * - Description rendered as full Markdown via MarkdownRenderer (max 720px)
 * - Active Task Assignments section: table of tasks referencing this persona
 *
 * Layout: AppLayout with `variant="constrained"` for detail page.
 * Auth: ProtectedRoute wraps via custom getLayout.
 * Data: TanStack Query `usePersona` hook with 15s polling.
 */
import { AlertTriangle, FileQuestion, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useState } from 'react';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { PersonaFormModal } from '@/components/personas/persona-form-modal';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeletePersona, usePersona } from '@/lib/query-hooks';

import type { NextPageWithLayout } from '../_app';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the persona data returned by the API detail endpoint. */
interface PersonaData {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  /** Optimistic locking version for updates. */
  version?: number | undefined;
  /** Task counts from the API: { active, total }. */
  taskCounts?: { active: number; total: number } | undefined;
  /** Active task assignments with parent story and project context. */
  activeTaskAssignments?: ActiveTaskAssignment[] | undefined;
}

/** A task assignment referencing this persona. */
interface ActiveTaskAssignment {
  taskId: string;
  taskTitle: string;
  storyId: string;
  storyTitle: string;
  projectId: string;
  projectName: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Loading skeleton for the persona detail page. */
const DetailSkeleton = () => (
  <div role="status" aria-live="polite" aria-label="Loading persona details">
    {/* Breadcrumb skeleton */}
    <div className="mb-4">
      <Skeleton width="200px" height="14px" rounded="rounded-sm" />
    </div>

    {/* Header skeleton */}
    <div className="mb-2">
      <Skeleton width="320px" height="30px" rounded="rounded-sm" />
    </div>
    <div className="mb-6">
      <Skeleton width="280px" height="14px" rounded="rounded-sm" />
    </div>

    {/* Action buttons skeleton */}
    <div className="mb-8 flex gap-2">
      <Skeleton width="70px" height="36px" rounded="rounded-md" />
      <Skeleton width="80px" height="36px" rounded="rounded-md" />
    </div>

    {/* Description skeleton */}
    <div className="mb-8 max-w-[720px]">
      <SkeletonText lines={4} />
    </div>

    {/* Active task assignments skeleton */}
    <div className="rounded-md border border-zinc-200 bg-white p-6">
      <Skeleton width="200px" height="20px" rounded="rounded-sm" />
      <div className="mt-4">
        <SkeletonText lines={3} />
      </div>
    </div>
  </div>
);

/** 404 state when a persona is not found. */
const PersonaNotFound = () => {
  const router = useRouter();
  const handleGoBack = useCallback(() => {
    void router.push('/personas');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
        <FileQuestion className="h-8 w-8 text-zinc-400" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-zinc-900">Persona Not Found</h1>
      <p className="mt-2 text-sm text-zinc-500">
        The persona you are looking for does not exist or has been deleted.
      </p>
      <Button variant="outline" className="mt-6" onClick={handleGoBack}>
        Back to Personas
      </Button>
    </div>
  );
};

/** Generic error state for non-404 failures. */
const PersonaError = ({ onRetry }: { onRetry: () => void }) => (
  <div className="flex flex-col items-center justify-center py-24">
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
      <AlertTriangle className="h-8 w-8 text-red-400" aria-hidden="true" />
    </div>
    <h1 className="mt-4 text-xl font-semibold text-zinc-900">Something went wrong</h1>
    <p className="mt-2 text-sm text-zinc-500">
      We couldn&apos;t load this persona. Please try again.
    </p>
    <Button variant="outline" className="mt-6" onClick={onRetry}>
      Retry
    </Button>
  </div>
);

/** Active task assignments table. */
const ActiveTaskAssignmentsSection = ({ assignments }: { assignments: ActiveTaskAssignment[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>Active Task Assignments</CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      {assignments.length === 0 ? (
        <div className="px-6 pb-6">
          <p className="text-sm text-zinc-500">No tasks currently use this persona.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-zinc-200 hover:bg-transparent">
                <TableHead className="text-overline h-10 px-4 text-zinc-500">Task</TableHead>
                <TableHead className="text-overline h-10 px-4 text-zinc-500">Story</TableHead>
                <TableHead className="text-overline h-10 px-4 text-zinc-500">Project</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => (
                <TableRow key={assignment.taskId} className="h-10 border-b border-zinc-200">
                  <TableCell className="px-4 py-2">
                    <Link
                      href={`/projects/${assignment.projectId}/tasks/${assignment.taskId}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {assignment.taskTitle}
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    <Link
                      href={`/projects/${assignment.projectId}/stories/${assignment.storyId}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {assignment.storyTitle}
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    <Link
                      href={`/projects/${assignment.projectId}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {assignment.projectName}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </CardContent>
  </Card>
);

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const PersonaDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const personaId = router.query.personaId as string;

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Fetch persona detail (15s polling configured via query client defaults)
  const {
    data: personaData,
    isLoading: personaLoading,
    isError: personaError,
    error: personaQueryError,
    refetch: refetchPersona,
  } = usePersona(personaId);
  const persona = personaData?.data as PersonaData | undefined;

  // Delete mutation
  const deletePersona = useDeletePersona();

  // Derive active task data from the API response
  const activeTaskCount = persona?.taskCounts?.active ?? 0;
  const activeTaskAssignments = persona?.activeTaskAssignments ?? [];
  const hasActiveTasks = activeTaskCount > 0;

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(() => {
    if (deletePersona.isPending) return;

    deletePersona.mutate(personaId, {
      onSuccess: () => {
        toast.success('Persona Deleted', `"${persona?.title ?? ''}" has been permanently deleted.`);
        setDeleteDialogOpen(false);
        void router.replace('/personas');
      },
      onError: (error: Error) => {
        toast.error('Delete Failed', error.message);
        // Dialog stays open for retry
      },
    });
  }, [deletePersona, personaId, persona?.title, router]);

  // Loading state
  if (personaLoading || !router.isReady) {
    return <DetailSkeleton />;
  }

  // Error state: differentiate 404 from other errors
  if (personaError) {
    const errorCause = personaQueryError.cause;
    const errorCode =
      errorCause !== null &&
      errorCause !== undefined &&
      typeof errorCause === 'object' &&
      'error' in errorCause &&
      errorCause.error !== null &&
      errorCause.error !== undefined &&
      typeof errorCause.error === 'object' &&
      'code' in errorCause.error &&
      typeof errorCause.error.code === 'string'
        ? errorCause.error.code
        : '';
    // The persona detail endpoint throws PERSONA_NOT_FOUND for missing personas.
    // Also handle generic NOT_FOUND_RESOURCE for robustness.
    const isNotFound = errorCode === 'PERSONA_NOT_FOUND' || errorCode === 'NOT_FOUND_RESOURCE';
    if (isNotFound) {
      return <PersonaNotFound />;
    }
    return (
      <PersonaError
        onRetry={() => {
          void refetchPersona();
        }}
      />
    );
  }

  // No data after loading (shouldn't normally happen)
  if (!persona) {
    return <PersonaNotFound />;
  }

  const breadcrumbItems = [{ label: 'Personas', href: '/personas' }, { label: persona.title }];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} />

      {/* Header: Title + ID + Action buttons */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[30px] leading-tight font-bold text-zinc-900">{persona.title}</h1>
            <p className="mt-1 font-mono text-[13px] text-zinc-400" aria-label="Persona ID">
              {persona.id}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setEditModalOpen(true);
              }}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>

            {hasActiveTasks ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex cursor-not-allowed"
                    aria-label="Delete persona (disabled)"
                    aria-disabled="true"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      disabled
                      className="text-red-500"
                      aria-hidden="true"
                      tabIndex={-1}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Delete
                    </Button>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Cannot delete — {String(activeTaskCount)} active{' '}
                  {activeTaskCount === 1 ? 'task uses' : 'tasks use'} this persona.
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="ghost"
                className="text-red-500 hover:bg-red-50 hover:text-red-600"
                onClick={() => {
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Description section */}
      {persona.description !== '' && (
        <div>
          <MarkdownRenderer content={persona.description} />
        </div>
      )}

      {/* Active Task Assignments */}
      <ActiveTaskAssignmentsSection assignments={activeTaskAssignments} />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
        }}
        title="Delete Persona?"
        description="This will permanently delete this persona. Tasks currently using this persona will need to be reassigned. This action cannot be undone."
        confirmLabel="Delete Persona"
        onConfirm={handleDeleteConfirm}
        loading={deletePersona.isPending}
        variant="destructive"
      />

      {/* Edit Persona Modal */}
      <PersonaFormModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        persona={{
          id: persona.id,
          title: persona.title,
          description: persona.description,
          version: persona.version,
        }}
      />
    </div>
  );
};

/**
 * Custom layout: wraps in ProtectedRoute + AppLayout with `variant="constrained"`
 * for detail page content width.
 */
PersonaDetailPage.getLayout = (page: ReactElement) => (
  <ProtectedRoute>
    <AppLayout variant="constrained">{page}</AppLayout>
  </ProtectedRoute>
);

export default PersonaDetailPage;
