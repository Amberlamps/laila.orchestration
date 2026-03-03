/**
 * Publish Epic Flow
 *
 * Manages the publish validation flow for epics. First validates all
 * child entities via the validate endpoint, then publishes if valid.
 *
 * Flow states:
 * 1. "validating" -- calling the validate API, showing a spinner
 * 2. "errors"     -- validation failed, displaying categorized issues
 * 3. "confirming" -- validation passed, asking user to confirm publish
 * 4. "publishing" -- calling the publish API after user confirms
 * 5. "success"    -- publish complete
 */
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { usePublishEpic, useValidateEpic } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidationIssue {
  entityType: string;
  entityName: string;
  issue: string;
}

type FlowState = 'validating' | 'errors' | 'confirming' | 'publishing' | 'success';

export interface PublishEpicFlowProps {
  projectId: string;
  epicId: string;
  epicName: string;
  open: boolean;
  onClose: () => void;
  /** Called after a successful publish so the parent can refresh data. */
  onPublished?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Groups validation issues by entity type for organized display.
 */
function groupIssuesByType(issues: ValidationIssue[]): Map<string, ValidationIssue[]> {
  const grouped = new Map<string, ValidationIssue[]>();

  for (const issue of issues) {
    const existing = grouped.get(issue.entityType);
    if (existing) {
      existing.push(issue);
    } else {
      grouped.set(issue.entityType, [issue]);
    }
  }

  return grouped;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PublishEpicFlow({
  projectId,
  epicId,
  epicName,
  open,
  onClose,
  onPublished,
}: PublishEpicFlowProps) {
  const [flowState, setFlowState] = useState<FlowState>('validating');
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);

  const validateEpic = useValidateEpic();
  const publishEpic = usePublishEpic();

  /**
   * Step 1: Validate the epic structure without changing state.
   */
  const runValidation = useCallback(() => {
    setFlowState('validating');
    setValidationIssues([]);

    validateEpic.mutate(
      { projectId, epicId },
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
  }, [projectId, epicId, validateEpic, onClose]);

  /**
   * Step 2: Publish the epic after validation passes and user confirms.
   */
  const runPublish = useCallback(() => {
    setFlowState('publishing');

    publishEpic.mutate(
      { projectId, epicId },
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
  }, [projectId, epicId, publishEpic]);

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
    toast.success('Epic Published', `"${epicName}" has been transitioned to Ready status.`);
    onPublished?.();
    onClose();
  }, [epicName, onPublished, onClose]);

  const handleFixIssues = useCallback(() => {
    onClose();
  }, [onClose]);

  const groupedIssues = groupIssuesByType(validationIssues);

  // --- Validating state ---
  if (flowState === 'validating') {
    return (
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
      >
        <DialogContent size="sm" aria-describedby="publish-epic-validating-desc">
          <DialogHeader>
            <DialogTitle>Publishing Epic</DialogTitle>
            <DialogDescription id="publish-epic-validating-desc">
              Validating epic structure before publishing.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-6">
            <div
              className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-500"
              role="status"
            >
              <span className="sr-only">Validating...</span>
            </div>
            <p className="text-sm text-zinc-600">Validating epic structure...</p>
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
        <DialogContent size="md" aria-describedby="publish-epic-errors-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
              Validation Issues Found
            </DialogTitle>
            <DialogDescription id="publish-epic-errors-desc">
              The following issues must be resolved before &ldquo;{epicName}&rdquo; can be
              published.
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable issue list */}
          <div
            className="max-h-[320px] overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50"
            role="list"
            aria-label="Validation issues"
          >
            {Array.from(groupedIssues.entries()).map(([entityType, issues]) => (
              <div key={entityType} className="border-b border-zinc-200 last:border-b-0">
                <div className="sticky top-0 bg-zinc-100 px-4 py-2">
                  <h4 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
                    {entityType} ({String(issues.length)})
                  </h4>
                </div>
                <ul className="divide-y divide-zinc-100">
                  {issues.map((issue, index) => (
                    <li
                      key={`${entityType}-${String(index)}`}
                      className="flex flex-col gap-0.5 px-4 py-3"
                    >
                      <span className="text-sm font-medium text-zinc-900">{issue.entityName}</span>
                      <span className="text-[13px] text-zinc-500">{issue.issue}</span>
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
        <DialogContent size="sm" aria-describedby="publish-epic-publishing-desc">
          <DialogHeader>
            <DialogTitle>Publishing Epic</DialogTitle>
            <DialogDescription id="publish-epic-publishing-desc">
              Transitioning epic to Ready status.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-6">
            <div
              className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-500"
              role="status"
            >
              <span className="sr-only">Publishing...</span>
            </div>
            <p className="text-sm text-zinc-600">Publishing epic...</p>
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
        <DialogContent size="sm" aria-describedby="publish-epic-confirm-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" aria-hidden="true" />
              Validation Passed
            </DialogTitle>
            <DialogDescription id="publish-epic-confirm-desc">
              &ldquo;{epicName}&rdquo; has passed all validation checks and is ready to be
              published. This will transition it to Ready status.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={runPublish}>Publish Epic</Button>
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
      <DialogContent size="sm" aria-describedby="publish-epic-success-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" aria-hidden="true" />
            Epic Published
          </DialogTitle>
          <DialogDescription id="publish-epic-success-desc">
            &ldquo;{epicName}&rdquo; has been validated and transitioned to Ready status.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button onClick={handleSuccessClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
