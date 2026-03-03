/**
 * Delete Epic Flow
 *
 * Manages the delete confirmation flow for epics. Shows a confirmation
 * dialog with entity counts and handles the delete operation with proper
 * error handling, loading states, and post-delete navigation.
 *
 * Features:
 * - In-progress work guard: disabled button with tooltip when work is active
 * - Entity count display: shows how many stories and tasks will be deleted
 * - Confirmation dialog with destructive styling (role="alertdialog")
 * - Loading spinner during deletion
 * - Success toast + redirect to /projects/{projectId}?tab=epics
 * - Error toast + dialog stays open for retry
 * - Double-submission prevention via loading state
 */
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeleteEpic } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EpicEntityCounts {
  stories: number;
  tasks: number;
}

export interface DeleteEpicFlowProps {
  projectId: string;
  epicId: string;
  epicName: string;
  entityCounts: EpicEntityCounts;
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
function buildDeleteDescription(entityCounts: EpicEntityCounts): string {
  const parts: string[] = [];

  if (entityCounts.stories > 0) {
    parts.push(
      `${String(entityCounts.stories)} ${entityCounts.stories === 1 ? 'story' : 'stories'}`,
    );
  }
  if (entityCounts.tasks > 0) {
    parts.push(`${String(entityCounts.tasks)} task${entityCounts.tasks === 1 ? '' : 's'}`);
  }

  if (parts.length === 0) {
    return 'This will permanently delete this epic. This action cannot be undone.';
  }

  let entityList: string;
  if (parts.length === 1) {
    entityList = parts[0] ?? '';
  } else {
    entityList = (parts[0] ?? '') + ' and ' + (parts[1] ?? '');
  }

  return (
    'This will permanently delete ' +
    entityList +
    ' within this epic. This action cannot be undone.'
  );
}

// ---------------------------------------------------------------------------
// Delete Trigger Button
// ---------------------------------------------------------------------------

export interface DeleteEpicButtonProps {
  hasInProgressWork: boolean;
  onClick: () => void;
  /** Optional variant override. Defaults to "ghost". */
  variant?: 'destructive' | 'ghost';
  /** Optional children override. Defaults to "Delete Epic". */
  children?: React.ReactNode;
  /** Optional className for the button. */
  className?: string;
  /** Optional aria-label for the button. */
  'aria-label'?: string;
}

/**
 * Delete button with in-progress work guard.
 * When the epic has in-progress stories, the button is disabled and wrapped
 * in a tooltip explaining why deletion is not possible.
 */
export function DeleteEpicButton({
  hasInProgressWork,
  onClick,
  variant = 'ghost',
  children,
  className,
  'aria-label': ariaLabel,
}: DeleteEpicButtonProps) {
  if (hasInProgressWork) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Wrapping in a button so the tooltip works even though it is disabled visually */}
          <button
            type="button"
            className="inline-flex cursor-not-allowed"
            aria-label={ariaLabel ?? 'Delete epic (disabled)'}
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
              {children ?? 'Delete Epic'}
            </Button>
          </button>
        </TooltipTrigger>
        <TooltipContent>Cannot delete epic with in-progress stories.</TooltipContent>
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
      {children ?? 'Delete Epic'}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Delete Flow Dialog
// ---------------------------------------------------------------------------

export function DeleteEpicFlow(props: DeleteEpicFlowProps) {
  const projectId = props.projectId;
  const epicId = props.epicId;
  const epicName = props.epicName;
  const entityCounts = props.entityCounts;
  const open = props.open;
  const onClose = props.onClose;
  const router = useRouter();
  const deleteEpic = useDeleteEpic(projectId);

  const description = buildDeleteDescription(entityCounts);

  const handleConfirmDelete = useCallback(() => {
    // Prevent double-submission: if already deleting, do nothing
    if (deleteEpic.isPending) return;

    deleteEpic.mutate(epicId, {
      onSuccess: () => {
        toast.success('Epic Deleted', `"${epicName}" has been permanently deleted.`);
        onClose();
        void router.replace(`/projects/${projectId}?tab=epics`);
      },
      onError: (error: Error) => {
        toast.error('Delete Failed', error.message);
        // Dialog stays open for retry -- do NOT call onClose()
      },
    });
  }, [deleteEpic, epicId, epicName, onClose, router, projectId]);

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Delete Epic "${epicName}"?`}
      description={description}
      confirmLabel="Delete Epic"
      onConfirm={handleConfirmDelete}
      loading={deleteEpic.isPending}
      variant="destructive"
    />
  );
}
