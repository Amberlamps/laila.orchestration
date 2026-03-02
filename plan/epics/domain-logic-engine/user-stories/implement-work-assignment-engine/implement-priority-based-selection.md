# Implement Priority-Based Selection

## Task Details

- **Title:** Implement Priority-Based Selection
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Work Assignment Engine](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** Implement Eligibility Rules

## Description

Implement the selection logic that chooses the best user story for assignment from the eligible candidates. When multiple stories are eligible, the selection algorithm uses a three-tier tiebreaker system:

1. **Priority level** (high > medium > low) — stories with higher priority are assigned first
2. **Topological order** — among same-priority stories, those earlier in the derived story dependency topological sort are preferred (dependencies before dependents)
3. **Creation time** — as a final tiebreaker, the story created earliest is selected

This function takes the list of eligible story IDs (from the eligibility rules) and returns the single best story to assign next, or null if no stories are eligible.

```typescript
// packages/domain/src/assignment/priority-selection.ts
// Selects the highest-priority eligible story for assignment.
// Uses a three-tier comparison: priority level, topological order,
// then creation time as the final tiebreaker.
// Pure function: no database calls, no side effects.
import type { AdjacencyList } from "../dag/types";

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
export function selectStoryForAssignment(
  eligibleStoryIds: string[],
  stories: Map<string, StorySelectionInfo>,
  storyTopologicalOrder: string[]
): SelectionResult {
  if (eligibleStoryIds.length === 0) {
    return {
      selected: false,
      reason: "No eligible stories available for assignment",
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
      reason: "Eligible stories have no metadata (data inconsistency)",
    };
  }

  // Sort by the three-tier comparison.
  const sorted = [...eligibleWithInfo].sort((a, b) => {
    // Tier 1: Priority (descending — higher priority first).
    const priorityDiff =
      PRIORITY_VALUES[b.priority] - PRIORITY_VALUES[a.priority];
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

  const selected = sorted[0];
  return {
    selected: true,
    storyId: selected.id,
    reason: `Selected "${selected.id}" — priority: ${selected.priority}, position: ${topoPosition.get(selected.id) ?? "N/A"}`,
  };
}

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
export function rankEligibleStories(
  eligibleStoryIds: string[],
  stories: Map<string, StorySelectionInfo>,
  storyTopologicalOrder: string[]
): string[] {
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
      const priorityDiff =
        PRIORITY_VALUES[b.priority] - PRIORITY_VALUES[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      const topoA = topoPosition.get(a.id) ?? Infinity;
      const topoB = topoPosition.get(b.id) ?? Infinity;
      const topoDiff = topoA - topoB;
      if (topoDiff !== 0) return topoDiff;

      return a.createdAt.getTime() - b.createdAt.getTime();
    })
    .map((info) => info.id);
}
```

## Acceptance Criteria

- [ ] `selectStoryForAssignment()` returns the highest-priority eligible story
- [ ] Priority comparison is correct: high > medium > low
- [ ] Among same-priority stories, topological order is used as the second tiebreaker
- [ ] Among same-priority and same-topo-position stories, creation time (oldest first) is the final tiebreaker
- [ ] Empty eligible list returns `{ selected: false }` with a reason
- [ ] Stories not in the topological order are sorted last (Infinity position)
- [ ] The selection is deterministic — same inputs always produce the same result
- [ ] `rankEligibleStories()` returns the full sorted list (not just the top pick)
- [ ] `PRIORITY_VALUES` maps priority names to numeric values for comparison
- [ ] The selection reason includes the selected story ID and its priority
- [ ] All functions are pure — no side effects, no database calls
- [ ] No `any` types used

## Technical Notes

- The three-tier comparison ensures deterministic selection even when multiple stories have the same priority and topological position. The creation time tiebreaker guarantees a total ordering.
- The `storyTopologicalOrder` parameter comes from running topological sort on the derived story dependency graph (from the DAG operations module). Stories earlier in this ordering are "closer to the root" and should be worked on first.
- Stories that don't appear in the topological order (e.g., isolated stories with no dependencies) get `Infinity` position, meaning they sort after stories with known positions. This biases toward dependency-connected stories.
- The `rankEligibleStories()` function is useful for showing a "work queue" in the UI — the full prioritized list of stories that could be assigned next.
- Consider caching the topological order computation if it's called frequently (it's O(V + E) each time).

## References

- **Functional Requirements:** FR-ASSIGN-010 (priority-based selection), FR-ASSIGN-011 (tiebreaker rules)
- **Design Specification:** Section 5.3.2 (Priority Selection Algorithm), Section 5.3.3 (Ranking)
- **Project Setup:** Domain package structure, pure function conventions

## Estimated Complexity

Medium — The sorting algorithm with three tiers is well-defined but requires careful implementation of the comparison function. The topological position map and handling of stories not in the topo order add nuance. The dual interface (single selection + full ranking) doubles the testing surface.
