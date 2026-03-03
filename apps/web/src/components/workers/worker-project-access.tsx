/**
 * Worker Project Access Management
 *
 * Displays a card with a table of projects the worker has access to,
 * with the ability to add new projects (via a Command popover) and
 * remove existing project access (with an active-work guard).
 *
 * Features:
 * - "+ Add Project" button with Command-based project picker (search/filter)
 * - Optimistic add with rollback on failure
 * - Remove with active-work guard (destructive confirm dialog for forced removal)
 * - Current assignment display per project row
 * - Loading states for add/remove operations
 */
import { FolderOpen, Loader2, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SkeletonTable } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import {
  useAddWorkerProject,
  useProjects,
  useRemoveWorkerProject,
  useWorkerProjects,
} from '@/lib/query-hooks';

import type { WorkStatus } from '@/components/ui/status-badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkerProjectAccessProps {
  workerId: string;
}

/** Project data shape for project access resolution. */
interface ProjectData {
  id: string;
  name: string;
  workStatus: string;
  lifecycleStatus: string;
}

/** Shape of an in-progress story from the 409 conflict response. */
interface InProgressStory {
  id: string;
  title: string;
  workStatus: string;
}

/** State for the remove confirmation dialog. */
interface RemoveConfirmState {
  projectId: string;
  projectName: string;
  stories: InProgressStory[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps an API WorkStatus to the StatusBadge WorkStatus type.
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
 * Parses the 409 conflict error response to extract in-progress story info.
 */
const parseConflictError = (error: unknown): InProgressStory[] => {
  if (
    error instanceof Error &&
    error.cause !== null &&
    typeof error.cause === 'object' &&
    'error' in (error.cause as Record<string, unknown>)
  ) {
    const cause = error.cause as {
      error?: {
        details?: {
          inProgressStories?: InProgressStory[];
        };
      };
    };
    return cause.error?.details?.inProgressStories ?? [];
  }
  return [];
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Project picker popover using the Command component for search/filter.
 * Shows projects the worker does NOT currently have access to.
 * Supports controlled open state from parent.
 */
const AddProjectPopover = ({
  availableProjects,
  projectLookup,
  isAdding,
  onSelect,
  open,
  onOpenChange,
}: {
  availableProjects: string[];
  projectLookup: Map<string, ProjectData>;
  isAdding: boolean;
  onSelect: (projectId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const handleSelect = useCallback(
    (projectId: string) => {
      onSelect(projectId);
      onOpenChange(false);
    },
    [onSelect, onOpenChange],
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={isAdding}>
          {isAdding ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
          Add Project
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search projects..." />
          <CommandList>
            <CommandEmpty>
              {availableProjects.length === 0 ? 'All projects assigned' : 'No projects found'}
            </CommandEmpty>
            <CommandGroup>
              {availableProjects.map((projectId) => {
                const project = projectLookup.get(projectId);
                if (!project) return null;
                return (
                  <CommandItem
                    key={projectId}
                    value={project.name}
                    onSelect={() => {
                      handleSelect(projectId);
                    }}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-zinc-900">
                        {project.name}
                      </span>
                      <StatusBadge status={mapApiWorkStatus(project.workStatus)} />
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * WorkerProjectAccess -- Manages project access for a worker.
 *
 * Displays a card with:
 * - A header with "+ Add Project" button (Command popover for search/filter)
 * - A table of currently assigned projects with status, current assignment, and remove button
 * - Empty state when no projects are assigned
 * - Loading skeleton while data is fetching
 */
export function WorkerProjectAccess({ workerId }: WorkerProjectAccessProps) {
  // Shared popover open state (used by both header button and empty state CTA)
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);

  // Fetch worker project access records
  const { data: projectAccessData, isLoading: projectsLoading } = useWorkerProjects(workerId);
  const projectAccess = useMemo(() => projectAccessData?.data ?? [], [projectAccessData]);

  // Fetch all projects for name/status resolution and available projects computation
  const { data: allProjectsData } = useProjects();

  // Mutations
  const addMutation = useAddWorkerProject(workerId);
  const removeMutation = useRemoveWorkerProject(workerId);

  // Confirm dialog state for remove with active work
  const [removeConfirm, setRemoveConfirm] = useState<RemoveConfirmState | null>(null);

  // Track which project is currently being removed (for row-level loading indicator)
  const [removingProjectId, setRemovingProjectId] = useState<string | null>(null);

  // Build project lookup map
  const projectLookup = useMemo(() => {
    const map = new Map<string, ProjectData>();
    if (allProjectsData?.data) {
      for (const project of allProjectsData.data as ProjectData[]) {
        map.set(project.id, project);
      }
    }
    return map;
  }, [allProjectsData]);

  // Compute available projects (not yet assigned to this worker)
  const availableProjectIds = useMemo(() => {
    if (!allProjectsData?.data) return [];
    const assignedIds = new Set(projectAccess.map((pa) => pa.projectId));
    return (allProjectsData.data as ProjectData[])
      .filter((p) => !assignedIds.has(p.id))
      .map((p) => p.id);
  }, [allProjectsData, projectAccess]);

  // Handle adding a project
  const handleAddProject = useCallback(
    (projectId: string) => {
      const project = projectLookup.get(projectId);
      addMutation.mutate(projectId, {
        onSuccess: () => {
          toast.success(
            'Project access granted',
            project ? `Worker now has access to "${project.name}".` : undefined,
          );
        },
        onError: () => {
          toast.error(
            'Failed to grant access',
            project
              ? `Could not grant access to "${project.name}". Please try again.`
              : 'Could not grant project access. Please try again.',
          );
        },
      });
    },
    [addMutation, projectLookup],
  );

  // Handle removing a project -- first try DELETE, then show confirm if 409
  const handleRemoveProject = useCallback(
    (projectId: string) => {
      const project = projectLookup.get(projectId);
      const projectName = project?.name ?? projectId;
      setRemovingProjectId(projectId);

      removeMutation.mutate(
        { projectId },
        {
          onSuccess: () => {
            setRemovingProjectId(null);
            toast.success(
              'Project access revoked',
              `Worker no longer has access to "${projectName}".`,
            );
          },
          onError: (error: Error) => {
            setRemovingProjectId(null);

            // Check if this is a 409 conflict (worker has active work)
            const inProgressStories = parseConflictError(error);
            if (inProgressStories.length > 0) {
              setRemoveConfirm({
                projectId,
                projectName,
                stories: inProgressStories,
              });
            } else {
              toast.error(
                'Failed to revoke access',
                `Could not revoke access to "${projectName}". Please try again.`,
              );
            }
          },
        },
      );
    },
    [removeMutation, projectLookup],
  );

  // Force remove project access (unassigns stories and revokes)
  const handleForceRemove = useCallback(() => {
    if (!removeConfirm) return;

    const { projectId, projectName } = removeConfirm;
    setRemoveConfirm(null);
    setRemovingProjectId(projectId);

    removeMutation.mutate(
      { projectId, force: true },
      {
        onSuccess: () => {
          setRemovingProjectId(null);
          toast.success(
            'Project access revoked',
            `Stories unassigned and worker no longer has access to "${projectName}".`,
          );
        },
        onError: () => {
          setRemovingProjectId(null);
          toast.error(
            'Failed to revoke access',
            `Could not revoke access to "${projectName}". Please try again.`,
          );
        },
      },
    );
  }, [removeConfirm, removeMutation]);

  // Close confirm dialog
  const handleCloseConfirm = useCallback(() => {
    setRemoveConfirm(null);
  }, []);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Project Access</CardTitle>
          <AddProjectPopover
            availableProjects={availableProjectIds}
            projectLookup={projectLookup}
            isAdding={addMutation.isPending}
            onSelect={handleAddProject}
            open={addPopoverOpen}
            onOpenChange={setAddPopoverOpen}
          />
        </CardHeader>
        <CardContent className="p-0">
          {projectsLoading ? (
            <div className="p-6 pt-0">
              <SkeletonTable columns={4} rows={3} />
            </div>
          ) : projectAccess.length === 0 ? (
            <EmptyState
              icon={(props: { className?: string }) => <FolderOpen {...props} />}
              title="No Projects Assigned"
              description="This worker does not have access to any projects. Add a project to allow this worker to receive work assignments."
              actionLabel="+ Add Project"
              onAction={() => {
                setAddPopoverOpen(true);
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-zinc-200 hover:bg-transparent">
                    <TableHead className="text-overline h-10 px-4 text-zinc-500">
                      Project Name
                    </TableHead>
                    <TableHead className="text-overline h-10 px-4 text-zinc-500">Status</TableHead>
                    <TableHead className="text-overline h-10 px-4 text-zinc-500">
                      Current Assignment
                    </TableHead>
                    <TableHead className="text-overline h-10 w-16 px-4 text-right text-zinc-500">
                      <span className="sr-only">Remove</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectAccess.map((access) => {
                    const project = projectLookup.get(access.projectId);
                    const isRemoving = removingProjectId === access.projectId;
                    const assignment = access.currentAssignment;

                    return (
                      <TableRow key={access.projectId} className="h-10 border-b border-zinc-200">
                        <TableCell className="px-4 py-2">
                          <Link
                            href={`/projects/${access.projectId}`}
                            className="font-medium text-indigo-600 hover:underline"
                          >
                            {project?.name ?? access.projectId}
                          </Link>
                        </TableCell>
                        <TableCell className="px-4 py-2">
                          {project ? (
                            <StatusBadge status={mapApiWorkStatus(project.workStatus)} />
                          ) : (
                            <span className="text-zinc-400">--</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-2">
                          {assignment ? (
                            <Link
                              href={`/projects/${access.projectId}/stories/${assignment.storyId}`}
                              className="text-blue-600 hover:underline"
                            >
                              {assignment.storyTitle}
                            </Link>
                          ) : (
                            <span className="text-zinc-400">None</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-right">
                          {isRemoving ? (
                            <div className="flex items-center justify-end">
                              <Loader2
                                className="h-4 w-4 animate-spin text-zinc-400"
                                aria-label="Removing project access"
                              />
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-zinc-400 hover:text-red-500"
                              onClick={() => {
                                handleRemoveProject(access.projectId);
                              }}
                              disabled={removeMutation.isPending}
                              aria-label={`Remove project ${project?.name ?? access.projectId}`}
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Destructive confirmation dialog for removing project with active work */}
      {removeConfirm !== null && (
        <ConfirmDialog
          open={true}
          onClose={handleCloseConfirm}
          title={`Remove access to "${removeConfirm.projectName}"?`}
          description={
            removeConfirm.stories.length === 1
              ? `This worker is currently working on "${removeConfirm.stories[0].title}" in this project. Removing access will unassign the story and revoke project access.`
              : `This worker has ${String(removeConfirm.stories.length)} active story assignments in this project. Removing access will unassign all stories and revoke project access.`
          }
          confirmLabel="Remove Access"
          onConfirm={handleForceRemove}
          loading={removeMutation.isPending}
          variant="destructive"
        />
      )}
    </>
  );
}
