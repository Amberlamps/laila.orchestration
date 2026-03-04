// Selects the highest-priority eligible story for assignment.
// Uses a three-tier comparison: priority level, topological order,
// then creation time as the final tiebreaker.
// Pure function: no database calls, no side effects.

/**
 * Priority levels for user stories.
 * Numeric values enable simple comparison (higher = more urgent).
 */
export const PRIORITY_VALUES = {
  high: 3,
  medium: 2,
  low: 1,
} as const;

export type PriorityLevel = keyof typeof PRIORITY_VALUES;

/**
 * Story information needed for priority-based selection.
 */
export interface StorySelectionInfo {
  id: string;
  priority: PriorityLevel;
  createdAt: Date;
}

/**
 * Result of the story selection process.
 */
export type SelectionResult =
  | { selected: true; storyId: string; reason: string }
  | { selected: false; reason: string };

/**
 * Select the highest-priority eligible story for assignment.
 *
 * Selection algorithm:
 * 1. Filter to only eligible story IDs.
 * 2. Sort by priority (high > medium > low).
 * 3. Among same priority, sort by topological order
 *    (earlier in topo sort = closer to being dependency-free).
 * 4. Among same priority and topo order, sort by creation time ascending.
 * 5. Return the first story in the sorted list.
 *
 * @param eligibleStoryIds - Story IDs that passed the eligibility check
 * @param stories - Story metadata (priority, creation time) for each eligible story
 * @param storyTopologicalOrder - Topological ordering of stories from derived story dependencies
 * @returns The selected story or a "none eligible" result
 */
export const selectStoryForAssignment = (
  eligibleStoryIds: string[],
  stories: Map<string, StorySelectionInfo>,
  storyTopologicalOrder: string[],
): SelectionResult => {
  if (eligibleStoryIds.length === 0) {
    return {
      selected: false,
      reason: 'No eligible stories available for assignment',
    };
  }

  // Build a position map for topological ordering.
  // Stories earlier in the topo sort get lower position numbers.
  const topoPosition = new Map<string, number>();
  storyTopologicalOrder.forEach((storyId, index) => {
    topoPosition.set(storyId, index);
  });

  // Filter to eligible stories that have metadata.
  const eligibleWithInfo = eligibleStoryIds
    .map((id) => stories.get(id))
    .filter((info): info is StorySelectionInfo => info !== undefined);

  if (eligibleWithInfo.length === 0) {
    return {
      selected: false,
      reason: 'Eligible stories have no metadata (data inconsistency)',
    };
  }

  // Sort by the three-tier comparison.
  const sorted = [...eligibleWithInfo].sort((a, b) => {
    // Tier 1: Priority (descending — higher priority first).
    const priorityDiff = PRIORITY_VALUES[b.priority] - PRIORITY_VALUES[a.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // Tier 2: Topological order (ascending — earlier in topo sort first).
    // Stories not in the topo order get Infinity (sorted last).
    const topoA = topoPosition.get(a.id) ?? Infinity;
    const topoB = topoPosition.get(b.id) ?? Infinity;
    const topoDiff = topoA - topoB;
    if (topoDiff !== 0) return topoDiff;

    // Tier 3: Creation time (ascending — oldest first).
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  // sorted is non-empty because eligibleWithInfo.length === 0 is guarded above,
  // but TypeScript infers sorted[0] as potentially undefined — use nullish
  // coalescing with an early return to satisfy the type checker without !.
  const selected = sorted[0];
  if (!selected) {
    return { selected: false, reason: 'No eligible stories after sort (unexpected)' };
  }
  return {
    selected: true,
    storyId: selected.id,
    reason: `Selected "${selected.id}" — priority: ${selected.priority}, position: ${String(topoPosition.get(selected.id) ?? 'N/A')}`,
  };
};

/**
 * Rank all eligible stories by assignment priority.
 * Returns the full sorted list (not just the top one).
 * Useful for displaying a "next up" queue in the UI.
 *
 * @param eligibleStoryIds - Story IDs that passed eligibility
 * @param stories - Story metadata
 * @param storyTopologicalOrder - Topological ordering of derived story dependencies
 * @returns Sorted list of story IDs from highest to lowest priority
 */
export const rankEligibleStories = (
  eligibleStoryIds: string[],
  stories: Map<string, StorySelectionInfo>,
  storyTopologicalOrder: string[],
): string[] => {
  // Use the same sorting logic as selectStoryForAssignment.
  const topoPosition = new Map<string, number>();
  storyTopologicalOrder.forEach((storyId, index) => {
    topoPosition.set(storyId, index);
  });

  const eligibleWithInfo = eligibleStoryIds
    .map((id) => stories.get(id))
    .filter((info): info is StorySelectionInfo => info !== undefined);

  return [...eligibleWithInfo]
    .sort((a, b) => {
      const priorityDiff = PRIORITY_VALUES[b.priority] - PRIORITY_VALUES[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      const topoA = topoPosition.get(a.id) ?? Infinity;
      const topoB = topoPosition.get(b.id) ?? Infinity;
      const topoDiff = topoA - topoB;
      if (topoDiff !== 0) return topoDiff;

      return a.createdAt.getTime() - b.createdAt.getTime();
    })
    .map((info) => info.id);
};
