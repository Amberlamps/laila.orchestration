/**
 * Delete Project Flow
 *
 * Manages the delete confirmation flow for projects. Shows a confirmation
 * dialog with entity counts and handles the delete operation with proper
 * error handling, loading states, and post-delete navigation.
 *
 * Features:
 * - In-progress work guard: disabled button with tooltip when work is active
 * - Entity count display: shows how many epics, stories, tasks will be deleted
 * - Confirmation dialog with destructive styling (role="alertdialog")
 * - Loading spinner during deletion
 * - Success toast + redirect to /projects
 * - Error toast + dialog stays open for retry
 * - Double-submission prevention via loading state
 */
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeleteProject } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityCounts {
  epics: number;
  stories: number;
  tasks: number;
}

export interface DeleteProjectFlowProps {
  projectId: string;
  projectName: string;
  entityCounts: EntityCounts;
  hasInProgressWork: boolean;
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the consequence description string for the delete confirmation
 * dialog, listing how many child entities will be permanently removed.
 */
function buildDeleteDescription(entityCounts: EntityCounts): string {
  const parts: string[] = [];

  if (entityCounts.epics > 0) {
    parts.push(`${String(entityCounts.epics)} epic${entityCounts.epics === 1 ? '' : 's'}`);
  }
  if (entityCounts.stories > 0) {
    parts.push(
      `${String(entityCounts.stories)} ${entityCounts.stories === 1 ? 'story' : 'stories'}`,
    );
  }
  if (entityCounts.tasks > 0) {
    parts.push(`${String(entityCounts.tasks)} task${entityCounts.tasks === 1 ? '' : 's'}`);
  }

  if (parts.length === 0) {
    return 'This will permanently delete this project. This action cannot be undone.';
  }

  let entityList: string;
  if (parts.length === 1) {
    entityList = String(parts[0]);
  } else if (parts.length === 2) {
    entityList = String(parts[0]) + ' and ' + String(parts[1]);
  } else {
    entityList = parts.slice(0, -1).join(', ') + ', and ' + String(parts[parts.length - 1]);
  }

  return 'This will permanently delete ' + entityList + '. This action cannot be undone.';
}

// ---------------------------------------------------------------------------
// Delete Trigger Button
// ---------------------------------------------------------------------------

export interface DeleteProjectButtonProps {
  hasInProgressWork: boolean;
  onClick: () => void;
  /** Optional variant override. Defaults to "destructive". */
  variant?: 'destructive' | 'ghost';
  /** Optional children override. Defaults to "Delete Project". */
  children?: React.ReactNode;
  /** Optional className for the button. */
  className?: string;
  /** Optional aria-label for the button. */
  'aria-label'?: string;
}

/**
 * Delete button with in-progress work guard.
 * When the project has in-progress work, the button is disabled and wrapped
 * in a tooltip explaining why deletion is not possible.
 */
export function DeleteProjectButton({
  hasInProgressWork,
  onClick,
  variant = 'destructive',
  children,
  className,
  'aria-label': ariaLabel,
}: DeleteProjectButtonProps) {
  if (hasInProgressWork) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Wrapping in a button so the tooltip works even though it is disabled visually */}
          <button
            type="button"
            className="inline-flex cursor-not-allowed"
            aria-label={ariaLabel ?? 'Delete project (disabled)'}
            aria-disabled="true"
          >
            <Button
              type="button"
              variant={variant}
              disabled
              className={className}
              aria-hidden="true"
              tabIndex={-1}
            >
              {children ?? 'Delete Project'}
            </Button>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          Cannot delete project with in-progress work. Stop all workers first.
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
    >
      {children ?? 'Delete Project'}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Delete Flow Dialog
// ---------------------------------------------------------------------------

export function DeleteProjectFlow(props: DeleteProjectFlowProps) {
  const projectId = props.projectId;
  const projectName = props.projectName;
  const entityCounts = props.entityCounts;
  const open = props.open;
  const onClose = props.onClose;
  const router = useRouter();
  const deleteProject = useDeleteProject();

  const description = buildDeleteDescription(entityCounts);

  const handleConfirmDelete = useCallback(() => {
    // Prevent double-submission: if already deleting, do nothing
    if (deleteProject.isPending) return;

    deleteProject.mutate(projectId, {
      onSuccess: () => {
        toast.success('Project Deleted', `"${projectName}" has been permanently deleted.`);
        onClose();
        void router.replace('/projects');
      },
      onError: (error: Error) => {
        toast.error('Delete Failed', error.message);
        // Dialog stays open for retry -- do NOT call onClose()
      },
    });
  }, [deleteProject, projectId, projectName, onClose, router]);

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Delete Project "${projectName}"?`}
      description={description}
      confirmLabel="Delete Project"
      onConfirm={handleConfirmDelete}
      loading={deleteProject.isPending}
      variant="destructive"
    />
  );
}
