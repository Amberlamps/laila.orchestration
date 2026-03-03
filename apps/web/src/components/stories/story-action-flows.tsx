/**
 * Story Action Flows
 *
 * Lifecycle action flows for stories: publish, reset, unassign, delete.
 * Each flow uses a dialog/confirmation pattern with appropriate guards.
 *
 * Flows:
 * 1. **Publish** — validates story structure, then transitions Draft to Ready
 * 2. **Reset** — transitions a Failed story back to a system-determined status
 * 3. **Unassign** — removes the current worker assignment
 * 4. **Delete** — permanently deletes story + cascading child tasks
 */
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useDeleteStory,
  usePublishStory,
  useResetStory,
  useUnassignStory,
  useValidateStory,
} from '@/lib/query-hooks';

// ===========================================================================
// Types
// ===========================================================================

interface StoryValidationIssue {
  taskId: string;
  taskTitle: string;
  issues: string[];
}

type PublishFlowState = 'validating' | 'errors' | 'confirming' | 'publishing' | 'success';

// ===========================================================================
// Publish Story Flow
// ===========================================================================

export interface PublishStoryFlowProps {
  projectId: string;
  epicId: string;
  storyId: string;
  storyTitle: string;
  open: boolean;
  onClose: () => void;
  /** Called after a successful publish so the parent can refresh data. */
  onPublished?: () => void;
}

/**
 * Multi-state publish flow for stories.
 *
 * 1. Opens dialog and runs validation
 * 2. If validation fails, shows task-level issues
 * 3. If validation passes, shows confirmation
 * 4. On confirm, publishes the story
 * 5. On success, shows toast and closes
 */
export function PublishStoryFlow({
  projectId,
  epicId,
  storyId,
  storyTitle,
  open,
  onClose,
  onPublished,
}: PublishStoryFlowProps) {
  const [flowState, setFlowState] = useState<PublishFlowState>('validating');
  const [validationIssues, setValidationIssues] = useState<StoryValidationIssue[]>([]);

  const validateStory = useValidateStory();
  const publishStory = usePublishStory();

  /**
   * Step 1: Validate the story structure without changing state.
   */
  const runValidation = useCallback(() => {
    setFlowState('validating');
    setValidationIssues([]);

    validateStory.mutate(
      { projectId, epicId, storyId },
      {
        onSuccess: (result) => {
          if (result.valid) {
            setFlowState('confirming');
          } else {
            setValidationIssues(result.issues ?? []);
            setFlowState('errors');
          }
        },
        onError: (error: Error) => {
          toast.error('Validation Failed', error.message);
          onClose();
        },
      },
    );
  }, [projectId, epicId, storyId, validateStory, onClose]);

  /**
   * Step 2: Publish the story after validation passes and user confirms.
   */
  const runPublish = useCallback(() => {
    setFlowState('publishing');

    publishStory.mutate(
      { projectId, epicId, storyId },
      {
        onSuccess: () => {
          setFlowState('success');
        },
        onError: (error: Error) => {
          toast.error('Publish Failed', error.message);
          setFlowState('confirming');
        },
      },
    );
  }, [projectId, epicId, storyId, publishStory]);

  // Start the validation when the dialog opens
  useEffect(() => {
    if (open) {
      runValidation();
    }
    // Reset state when dialog closes
    if (!open) {
      const timer = setTimeout(() => {
        setFlowState('validating');
        setValidationIssues([]);
      }, 200);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only run on open change

  const handleSuccessClose = useCallback(() => {
    toast.success('Story Published', `"${storyTitle}" has been transitioned to Ready status.`);
    onPublished?.();
    onClose();
  }, [storyTitle, onPublished, onClose]);

  const handleFixIssues = useCallback(() => {
    onClose();
  }, [onClose]);

  // --- Validating state ---
  if (flowState === 'validating') {
    return (
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
      >
        <DialogContent size="sm" aria-describedby="publish-story-validating-desc">
          <DialogHeader>
            <DialogTitle>Publishing Story</DialogTitle>
            <DialogDescription id="publish-story-validating-desc">
              Validating story structure before publishing.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-6">
            <div
              className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-500"
              role="status"
            >
              <span className="sr-only">Validating...</span>
            </div>
            <p className="text-sm text-zinc-600">Validating story structure...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // --- Errors state ---
  if (flowState === 'errors') {
    return (
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
      >
        <DialogContent size="md" aria-describedby="publish-story-errors-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
              Validation Issues Found
            </DialogTitle>
            <DialogDescription id="publish-story-errors-desc">
              The following issues must be resolved before &ldquo;{storyTitle}&rdquo; can be
              published.
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable issue list grouped by task */}
          <div
            className="max-h-[320px] overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50"
            role="list"
            aria-label="Validation issues"
          >
            {validationIssues.map((taskIssue) => (
              <div key={taskIssue.taskId} className="border-b border-zinc-200 last:border-b-0">
                <div className="sticky top-0 bg-zinc-100 px-4 py-2">
                  <h4 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
                    {taskIssue.taskTitle} ({String(taskIssue.issues.length)}{' '}
                    {taskIssue.issues.length === 1 ? 'issue' : 'issues'})
                  </h4>
                </div>
                <ul className="divide-y divide-zinc-100">
                  {taskIssue.issues.map((issue, index) => (
                    <li
                      key={`${taskIssue.taskId}-${String(index)}`}
                      className="flex items-center gap-2 px-4 py-3"
                    >
                      <AlertTriangle
                        className="h-4 w-4 shrink-0 text-amber-500"
                        aria-hidden="true"
                      />
                      <span className="text-[13px] text-zinc-700">{issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleFixIssues}>
              Fix Issues
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // --- Publishing state (spinner while publish API call is in flight) ---
  if (flowState === 'publishing') {
    return (
      <Dialog
        open={open}
        onOpenChange={() => {
          /* prevent close during publish */
        }}
      >
        <DialogContent size="sm" aria-describedby="publish-story-publishing-desc">
          <DialogHeader>
            <DialogTitle>Publishing Story</DialogTitle>
            <DialogDescription id="publish-story-publishing-desc">
              Transitioning story to Ready status.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-6">
            <div
              className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-500"
              role="status"
            >
              <span className="sr-only">Publishing...</span>
            </div>
            <p className="text-sm text-zinc-600">Publishing story...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // --- Confirming state (validation passed, user confirms publish) ---
  if (flowState === 'confirming') {
    return (
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
      >
        <DialogContent size="sm" aria-describedby="publish-story-confirm-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" aria-hidden="true" />
              Validation Passed
            </DialogTitle>
            <DialogDescription id="publish-story-confirm-desc">
              &ldquo;{storyTitle}&rdquo; has passed all validation checks and is ready to be
              published. This will transition it to Ready status.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={runPublish}>Publish Story</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // --- Success state ---
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleSuccessClose();
      }}
    >
      <DialogContent size="sm" aria-describedby="publish-story-success-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" aria-hidden="true" />
            Story Published
          </DialogTitle>
          <DialogDescription id="publish-story-success-desc">
            &ldquo;{storyTitle}&rdquo; has been validated and transitioned to Ready status.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button onClick={handleSuccessClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Reset Story Flow
// ===========================================================================

export interface ResetStoryFlowProps {
  projectId: string;
  epicId: string;
  storyId: string;
  storyTitle: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Confirmation dialog for resetting a failed story.
 * Transitions the story from Failed back to a system-determined status,
 * clearing the error state and making it available for re-assignment.
 */
export function ResetStoryFlow({
  projectId,
  epicId,
  storyId,
  storyTitle,
  open,
  onClose,
}: ResetStoryFlowProps) {
  const resetStory = useResetStory();

  const handleConfirmReset = useCallback(() => {
    if (resetStory.isPending) return;

    resetStory.mutate(
      { projectId, epicId, storyId },
      {
        onSuccess: () => {
          toast.success(
            'Story Reset',
            `"${storyTitle}" has been reset and is available for re-assignment.`,
          );
          onClose();
        },
        onError: (error: Error) => {
          toast.error('Reset Failed', error.message);
        },
      },
    );
  }, [projectId, epicId, storyId, storyTitle, resetStory, onClose]);

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Reset "${storyTitle}"?`}
      description="This will clear the error state and make the story available for re-assignment. The server will determine the appropriate status based on the project and epic states."
      confirmLabel="Reset Story"
      onConfirm={handleConfirmReset}
      loading={resetStory.isPending}
      variant="warning"
    />
  );
}

// ===========================================================================
// Unassign Story Flow
// ===========================================================================

export interface UnassignStoryFlowProps {
  projectId: string;
  epicId: string;
  storyId: string;
  storyTitle: string;
  workerName: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Confirmation dialog for removing the current worker assignment from a story.
 * After unassignment, the story becomes available for assignment to another worker.
 */
export function UnassignStoryFlow({
  projectId,
  epicId,
  storyId,
  storyTitle,
  workerName,
  open,
  onClose,
}: UnassignStoryFlowProps) {
  const unassignStory = useUnassignStory();

  const handleConfirmUnassign = useCallback(() => {
    if (unassignStory.isPending) return;

    unassignStory.mutate(
      { projectId, epicId, storyId },
      {
        onSuccess: () => {
          toast.success(
            'Worker Unassigned',
            `"${workerName}" has been removed from "${storyTitle}".`,
          );
          onClose();
        },
        onError: (error: Error) => {
          toast.error('Unassign Failed', error.message);
        },
      },
    );
  }, [projectId, epicId, storyId, storyTitle, workerName, unassignStory, onClose]);

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Unassign worker from "${storyTitle}"?`}
      description={`Unassign worker "${workerName}" from "${storyTitle}"? The story will become available for assignment to another worker.`}
      confirmLabel="Unassign Worker"
      onConfirm={handleConfirmUnassign}
      loading={unassignStory.isPending}
      variant="warning"
    />
  );
}

// ===========================================================================
// Delete Story Flow
// ===========================================================================

export interface DeleteStoryButtonProps {
  hasInProgressWork: boolean;
  onClick: () => void;
  /** Optional variant override. Defaults to "ghost". */
  variant?: 'destructive' | 'ghost';
  /** Optional children override. Defaults to "Delete Story". */
  children?: React.ReactNode;
  /** Optional className for the button. */
  className?: string;
  /** Optional aria-label for the button. */
  'aria-label'?: string;
}

/**
 * Delete button with in-progress work guard.
 * When the story has in-progress work, the button is disabled and wrapped
 * in a tooltip explaining why deletion is not possible.
 */
export function DeleteStoryButton({
  hasInProgressWork,
  onClick,
  variant = 'ghost',
  children,
  className,
  'aria-label': ariaLabel,
}: DeleteStoryButtonProps) {
  if (hasInProgressWork) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Wrapping in a button so the tooltip works even though it is disabled visually */}
          <button
            type="button"
            className="inline-flex cursor-not-allowed"
            aria-label={ariaLabel ?? 'Delete story (disabled)'}
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
              {children ?? 'Delete Story'}
            </Button>
          </button>
        </TooltipTrigger>
        <TooltipContent>Cannot delete story with in-progress work</TooltipContent>
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
      {children ?? 'Delete Story'}
    </Button>
  );
}

// ---------------------------------------------------------------------------

export interface DeleteStoryFlowProps {
  epicId: string;
  projectId: string;
  storyId: string;
  storyTitle: string;
  taskCount: number;
  open: boolean;
  onClose: () => void;
}

/**
 * Delete confirmation flow for stories.
 * Shows a destructive confirmation dialog with task count,
 * then performs the delete and redirects to the parent epic detail page.
 */
export function DeleteStoryFlow({
  epicId,
  projectId,
  storyId,
  storyTitle,
  taskCount,
  open,
  onClose,
}: DeleteStoryFlowProps) {
  const router = useRouter();
  const deleteStory = useDeleteStory(epicId, projectId);

  const description =
    taskCount > 0
      ? `This will permanently delete ${String(taskCount)} ${taskCount === 1 ? 'task' : 'tasks'} within this story. This action cannot be undone.`
      : 'This will permanently delete this story. This action cannot be undone.';

  const handleConfirmDelete = useCallback(() => {
    if (deleteStory.isPending) return;

    deleteStory.mutate(storyId, {
      onSuccess: () => {
        toast.success('Story Deleted', `"${storyTitle}" has been permanently deleted.`);
        onClose();
        void router.replace(`/projects/${projectId}/epics/${epicId}`);
      },
      onError: (error: Error) => {
        toast.error('Delete Failed', error.message);
        // Dialog stays open for retry -- do NOT call onClose()
      },
    });
  }, [deleteStory, storyId, storyTitle, onClose, router, projectId, epicId]);

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Delete Story "${storyTitle}"?`}
      description={description}
      confirmLabel="Delete Story"
      onConfirm={handleConfirmDelete}
      loading={deleteStory.isPending}
      variant="destructive"
    />
  );
}
