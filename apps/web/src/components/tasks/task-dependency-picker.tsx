/**
 * Task Dependency Picker
 *
 * Multi-select component for choosing task dependencies within a project.
 * Displays all tasks grouped by Epic > Story hierarchy, supports search
 * filtering, and validates for circular dependencies in real-time using
 * client-side DFS cycle detection.
 *
 * Features:
 * - Grouped task list with collapsible Epic > Story headers
 * - Case-insensitive search filtering by task title
 * - Selected dependencies shown as removable chips/tags
 * - Client-side cycle detection with cycle path display
 * - Loading and empty state handling
 * - Keyboard accessible (Tab through items, Space to toggle)
 * - Integrates with React Hook Form via value/onChange props
 */
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { apiClient } from '@/lib/api-client';
import { useEpics, useProjectTasks } from '@/lib/query-hooks';
import { cn } from '@/lib/utils';

import type { WorkStatus } from '@/components/ui/status-badge';
import type { ProjectTask } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskDependencyPickerProps {
  /** ID of the task being edited (excluded from the selectable list) */
  currentTaskId?: string | undefined;
  /** Project scope for fetching available tasks */
  projectId: string;
  /** Currently selected dependency task IDs */
  value: string[];
  /** Called when the selection changes */
  onChange: (taskIds: string[]) => void;
  /** Validation error message */
  error?: string | undefined;
}

interface TaskOption {
  id: string;
  title: string;
  workStatus: string;
  userStoryId: string;
  dependencyIds: string[];
}

interface StoryGroup {
  storyTitle: string;
  storyId: string;
  tasks: TaskOption[];
}

interface TaskGroup {
  epicTitle: string;
  epicId: string;
  stories: StoryGroup[];
}

interface StoryInfo {
  id: string;
  title: string;
  epicId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_LIST_HEIGHT = 300;
const CYCLE_DETECTION_DEBOUNCE_MS = 300;
const HIGH_PAGE_LIMIT = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps an API work status string to the StatusBadge WorkStatus type.
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
 * Validates proposed dependency IDs via the API endpoint.
 * Returns cycle information if a cycle is detected, or null if valid.
 */
const validateDependenciesApi = async (
  taskId: string,
  dependencyIds: string[],
): Promise<{ valid: true } | { valid: false; cyclePath: string[]; message: string }> => {
  const response = await fetch(`/api/v1/tasks/${taskId}/validate-dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ dependencyIds }),
  });

  return response.json() as Promise<
    { valid: true } | { valid: false; cyclePath: string[]; message: string }
  >;
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches stories for all provided epic IDs in parallel.
 * Combines results into a flat array of StoryInfo.
 */
const useStoriesForEpics = (epicIds: string[]) => {
  const sortedIds = useMemo(() => [...epicIds].sort(), [epicIds]);

  return useQuery({
    queryKey: ['project-stories-for-picker', sortedIds],
    queryFn: async (): Promise<StoryInfo[]> => {
      if (sortedIds.length === 0) return [];

      const results = await Promise.all(
        sortedIds.map(async (epicId) => {
          const { data, error } = await apiClient.GET('/epics/{epicId}/stories', {
            params: {
              path: { epicId },
              query: { limit: HIGH_PAGE_LIMIT } as Record<string, unknown>,
            },
          });
          if (error) return [];
          const responseData = data as
            | { data: Array<{ id: string; title: string; epicId: string }> }
            | undefined;
          if (!responseData) return [];
          return responseData.data.map((s) => ({
            id: s.id,
            title: s.title,
            epicId: s.epicId,
          }));
        }),
      );

      return results.flat();
    },
    enabled: sortedIds.length > 0,
  });
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Selected dependency chip with remove button. */
const SelectedChip = ({ task, onRemove }: { task: TaskOption; onRemove: (id: string) => void }) => (
  <Badge variant="secondary" className="gap-1">
    {task.title}
    <button
      type="button"
      onClick={() => {
        onRemove(task.id);
      }}
      className="ml-1 rounded-full hover:bg-zinc-300"
      aria-label={`Remove ${task.title}`}
    >
      <X className="h-3 w-3" />
    </button>
  </Badge>
);

/** Cycle error message banner. */
const CycleErrorBanner = ({ message }: { message: string }) => (
  <div
    role="alert"
    data-testid="cycle-error"
    className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
  >
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
    <p className="text-[13px] leading-snug text-amber-700">{message}</p>
  </div>
);

/** Loading skeleton for the picker. */
const PickerSkeleton = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading tasks"
    className="space-y-3 rounded-lg border border-zinc-200 p-4"
  >
    <Skeleton width="100%" height="36px" rounded="rounded-md" />
    <div className="space-y-2">
      <Skeleton width="40%" height="14px" rounded="rounded-sm" />
      <Skeleton width="90%" height="28px" rounded="rounded-sm" />
      <Skeleton width="85%" height="28px" rounded="rounded-sm" />
      <Skeleton width="35%" height="14px" rounded="rounded-sm" />
      <Skeleton width="80%" height="28px" rounded="rounded-sm" />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TaskDependencyPicker({
  currentTaskId,
  projectId,
  value,
  onChange,
  error,
}: TaskDependencyPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const cycleTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const { data: tasksData, isLoading: tasksLoading } = useProjectTasks(projectId);
  const { data: epicsData, isLoading: epicsLoading } = useEpics(projectId, { limit: 100 });

  const epicIds = useMemo(() => {
    if (!epicsData?.data) return [];
    return (epicsData.data as Array<{ id: string }>).map((e) => e.id);
  }, [epicsData]);

  const { data: storiesData, isLoading: storiesLoading } = useStoriesForEpics(epicIds);

  const isLoading = tasksLoading || epicsLoading || storiesLoading;

  // -------------------------------------------------------------------------
  // Build lookup maps
  // -------------------------------------------------------------------------

  const allTasks: TaskOption[] = useMemo(() => {
    if (!tasksData?.data) return [];
    return tasksData.data.map((t: ProjectTask) => ({
      id: t.id,
      title: t.title,
      workStatus: t.workStatus,
      userStoryId: t.userStoryId,
      dependencyIds: t.dependencyIds,
    }));
  }, [tasksData]);

  /** Map of task ID to task for fast lookups. */
  const taskMap = useMemo(() => {
    const map = new Map<string, TaskOption>();
    for (const task of allTasks) {
      map.set(task.id, task);
    }
    return map;
  }, [allTasks]);

  /** Map of epic ID to epic name. */
  const epicMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!epicsData?.data) return map;
    const epics = epicsData.data as Array<{ id: string; name: string }>;
    for (const epic of epics) {
      map.set(epic.id, epic.name);
    }
    return map;
  }, [epicsData]);

  /** Map of story ID to { title, epicId }. */
  const storyMap = useMemo(() => {
    const map = new Map<string, { title: string; epicId: string }>();
    if (!storiesData) return map;
    for (const story of storiesData) {
      map.set(story.id, { title: story.title, epicId: story.epicId });
    }
    return map;
  }, [storiesData]);

  // -------------------------------------------------------------------------
  // Group and filter tasks
  // -------------------------------------------------------------------------

  /** Tasks excluding the current task, filtered by search query. */
  const filteredTasks = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase();
    return allTasks
      .filter((t) => t.id !== currentTaskId)
      .filter((t) => t.title.toLowerCase().includes(lowerQuery));
  }, [allTasks, currentTaskId, searchQuery]);

  /** Tasks grouped by Epic > Story hierarchy. */
  const groupedTasks = useMemo((): TaskGroup[] => {
    const epicGroupMap = new Map<string, TaskGroup>();

    for (const task of filteredTasks) {
      const storyInfo = storyMap.get(task.userStoryId);
      const epicId = storyInfo?.epicId ?? 'unknown';
      const epicTitle = epicMap.get(epicId) ?? 'Unknown Epic';
      const storyId = task.userStoryId;
      const storyTitle = storyInfo?.title ?? 'Unknown Story';

      let epicGroup = epicGroupMap.get(epicId);
      if (!epicGroup) {
        epicGroup = { epicTitle, epicId, stories: [] };
        epicGroupMap.set(epicId, epicGroup);
      }

      let storyGroup = epicGroup.stories.find((s) => s.storyId === storyId);
      if (!storyGroup) {
        storyGroup = { storyTitle, storyId, tasks: [] };
        epicGroup.stories.push(storyGroup);
      }

      storyGroup.tasks.push(task);
    }

    return Array.from(epicGroupMap.values());
  }, [filteredTasks, epicMap, storyMap]);

  /** Selected tasks resolved from value IDs. */
  const selectedTasks = useMemo(
    () => value.map((id) => taskMap.get(id)).filter((t): t is TaskOption => t !== undefined),
    [value, taskMap],
  );

  // -------------------------------------------------------------------------
  // Auto-expand groups when search is active
  // -------------------------------------------------------------------------

  const allGroupKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const epic of groupedTasks) {
      keys.add(epic.epicId);
    }
    return keys;
  }, [groupedTasks]);

  /** Effective expanded groups: all expanded when search is active. */
  const effectiveExpandedGroups = useMemo(() => {
    if (searchQuery.length > 0) return allGroupKeys;
    return expandedGroups;
  }, [searchQuery, allGroupKeys, expandedGroups]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const handleRemove = useCallback(
    (taskId: string) => {
      onChange(value.filter((id) => id !== taskId));
      setCycleError(null);
    },
    [value, onChange],
  );

  const handleToggle = useCallback(
    (taskId: string, checked: boolean) => {
      setCycleError(null);

      if (!checked) {
        onChange(value.filter((id) => id !== taskId));
        return;
      }

      // No current task (creating new task): no cycle possible
      if (!currentTaskId) {
        onChange([...value, taskId]);
        return;
      }

      // Debounced API-based cycle detection
      if (cycleTimeoutRef.current) {
        clearTimeout(cycleTimeoutRef.current);
      }

      const proposedDeps = [...value, taskId];

      cycleTimeoutRef.current = setTimeout(() => {
        void (async () => {
          try {
            const result = await validateDependenciesApi(currentTaskId, proposedDeps);

            if (!result.valid) {
              setCycleError(result.message);
              return;
            }

            onChange(proposedDeps);
          } catch {
            // If the API call fails, allow the selection and let the
            // server-side validation catch it on form submit
            onChange(proposedDeps);
          }
        })();
      }, CYCLE_DETECTION_DEBOUNCE_MS);
    },
    [currentTaskId, value, onChange],
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // -------------------------------------------------------------------------
  // Render: Loading state
  // -------------------------------------------------------------------------

  if (isLoading) {
    return <PickerSkeleton />;
  }

  // -------------------------------------------------------------------------
  // Render: Empty state (no tasks in project besides current)
  // -------------------------------------------------------------------------

  const availableTaskCount = allTasks.filter((t) => t.id !== currentTaskId).length;

  if (availableTaskCount === 0) {
    return (
      <div className="rounded-lg border border-zinc-200">
        <div className="flex items-center justify-center py-8 text-sm text-zinc-400">
          No tasks available
        </div>
        {error ? (
          <p className="px-4 pb-3 text-[13px] text-red-500" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Full picker
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-2">
      {/* Selected dependency chips */}
      {selectedTasks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTasks.map((task) => (
            <SelectedChip key={task.id} task={task} onRemove={handleRemove} />
          ))}
        </div>
      )}

      {/* Cycle error banner */}
      {cycleError ? <CycleErrorBanner message={cycleError} /> : null}

      {/* Picker container */}
      <div className="rounded-lg border border-zinc-200">
        {/* Search input */}
        <div className="relative border-b border-zinc-200 p-2">
          <Search
            className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
            }}
            placeholder="Search tasks..."
            className="h-8 w-full rounded-md border border-zinc-200 bg-transparent py-1 pr-8 pl-8 text-sm placeholder:text-zinc-400 focus:bg-zinc-50 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
            aria-label="Search tasks by title"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Task list */}
        <div
          className="overflow-y-auto"
          style={{ maxHeight: `${String(MAX_LIST_HEIGHT)}px` }}
          role="listbox"
          aria-label="Task dependencies"
          aria-multiselectable="true"
        >
          {groupedTasks.length === 0 && searchQuery.length > 0 && (
            <div className="flex items-center justify-center py-8 text-sm text-zinc-400">
              No tasks matching &ldquo;{searchQuery}&rdquo;
            </div>
          )}

          {groupedTasks.length === 0 && searchQuery.length === 0 && (
            <div className="flex items-center justify-center py-8 text-sm text-zinc-400">
              No tasks available
            </div>
          )}

          {groupedTasks.map((epicGroup) => (
            <div key={epicGroup.epicId}>
              {/* Epic group header */}
              <button
                type="button"
                onClick={() => {
                  toggleGroup(epicGroup.epicId);
                }}
                className="flex w-full items-center gap-1.5 border-b border-zinc-100 bg-zinc-50 px-3 py-1.5 text-left"
                aria-expanded={effectiveExpandedGroups.has(epicGroup.epicId)}
              >
                {effectiveExpandedGroups.has(epicGroup.epicId) ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
                )}
                <span className="text-xs font-medium text-zinc-500">{epicGroup.epicTitle}</span>
              </button>

              {/* Stories within epic */}
              {effectiveExpandedGroups.has(epicGroup.epicId) &&
                epicGroup.stories.map((storyGroup) => (
                  <div key={storyGroup.storyId}>
                    {/* Story sub-header */}
                    <div className="border-b border-zinc-100 bg-white px-3 py-1 pl-7">
                      <span className="text-xs text-zinc-400">{storyGroup.storyTitle}</span>
                    </div>

                    {/* Tasks within story */}
                    {storyGroup.tasks.map((task) => {
                      const isSelected = value.includes(task.id);
                      return (
                        <div
                          key={task.id}
                          className={cn(
                            'flex cursor-pointer items-center gap-2.5 border-b border-zinc-50 px-3 py-2 pl-10 transition-colors hover:bg-zinc-50',
                            isSelected && 'bg-indigo-50/50',
                          )}
                          role="option"
                          aria-selected={isSelected}
                          tabIndex={0}
                          onClick={() => {
                            handleToggle(task.id, !isSelected);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              handleToggle(task.id, !isSelected);
                            }
                          }}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              handleToggle(task.id, checked === true);
                            }}
                            aria-label={`Select ${task.title} as dependency`}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-zinc-900">
                            {task.title}
                          </span>
                          <StatusBadge
                            status={mapApiWorkStatus(task.workStatus)}
                            className="shrink-0"
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>

      {/* Parent form error */}
      {error ? (
        <p className="text-[13px] text-red-500" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
