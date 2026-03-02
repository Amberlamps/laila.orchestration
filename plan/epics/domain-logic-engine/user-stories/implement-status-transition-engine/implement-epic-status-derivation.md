# Implement Epic Status Derivation

## Task Details

- **Title:** Implement Epic Status Derivation
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Status Transition Engine](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** Implement Story Status Derivation

## Description

Implement epic status derivation from the statuses of its child user stories. Epic status is always derived — there are no direct transitions on epics. The epic's status is a summary of what its child stories are doing.

### Derivation Rules

Epic status is determined by evaluating the statuses of all child stories in priority order:

1. **complete:** ALL child stories are `complete`
2. **failed:** ANY child story is `failed` AND no story is `in-progress` (failure takes precedence when work has stopped)
3. **in-progress:** ANY child story is `in-progress` (active work happening)
4. **blocked:** ALL non-complete stories are `blocked` (no progress can be made)
5. **not-started:** Default — no story has started yet

```typescript
// packages/domain/src/status/epic-status-derivation.ts
// Derive epic status from child user story statuses.
// Epic status is always computed, never set directly.
// Pure function: no database calls, no side effects.
import type { UserStoryStatus, EpicStatus } from './transition-definitions';

/**
 * Minimal story information needed for epic status derivation.
 */
export interface EpicStoryInfo {
  id: string;
  status: UserStoryStatus;
}

/**
 * Result of epic status derivation with explanation.
 */
export interface EpicStatusDerivation {
  derivedStatus: EpicStatus;
  reason: string;
  /** Summary of child story statuses for debugging/display */
  storySummary: {
    total: number;
    complete: number;
    inProgress: number;
    failed: number;
    blocked: number;
    notStarted: number;
    draft: number;
  };
}

/**
 * Derive an epic's status from its child user stories.
 *
 * Evaluation priority:
 * 1. All complete -> "complete"
 * 2. Any failed AND none in-progress -> "failed"
 * 3. Any in-progress -> "in-progress"
 * 4. All non-complete are blocked -> "blocked"
 * 5. Default -> "not-started"
 *
 * @param stories - Child stories of the epic with their current statuses
 * @returns Derived epic status with explanation and summary
 */
export function deriveEpicStatus(stories: EpicStoryInfo[]): EpicStatusDerivation {
  // Count stories in each status for the summary.
  const summary = {
    total: stories.length,
    complete: 0,
    inProgress: 0,
    failed: 0,
    blocked: 0,
    notStarted: 0,
    draft: 0,
  };

  for (const story of stories) {
    switch (story.status) {
      case 'complete':
        summary.complete++;
        break;
      case 'in-progress':
        summary.inProgress++;
        break;
      case 'failed':
        summary.failed++;
        break;
      case 'blocked':
        summary.blocked++;
        break;
      case 'not-started':
        summary.notStarted++;
        break;
      case 'draft':
        summary.draft++;
        break;
    }
  }

  // Handle empty epic (no stories).
  if (stories.length === 0) {
    return {
      derivedStatus: 'not-started',
      reason: 'Epic has no user stories',
      storySummary: summary,
    };
  }

  // Rule 1: All stories complete -> epic is complete.
  if (summary.complete === summary.total) {
    return {
      derivedStatus: 'complete',
      reason: `All ${summary.total} stories are complete`,
      storySummary: summary,
    };
  }

  // Rule 2: Any failed AND none in-progress -> epic is failed.
  // The "none in-progress" condition ensures we don't mark an epic
  // as failed while work is still actively happening on other stories.
  if (summary.failed > 0 && summary.inProgress === 0) {
    return {
      derivedStatus: 'failed',
      reason: `${summary.failed} story/stories failed, no stories in progress`,
      storySummary: summary,
    };
  }

  // Rule 3: Any in-progress -> epic is in-progress.
  if (summary.inProgress > 0) {
    return {
      derivedStatus: 'in-progress',
      reason: `${summary.inProgress} story/stories in progress`,
      storySummary: summary,
    };
  }

  // Rule 4: All non-complete stories are blocked -> epic is blocked.
  const nonComplete = summary.total - summary.complete;
  if (nonComplete > 0 && summary.blocked === nonComplete) {
    return {
      derivedStatus: 'blocked',
      reason: `All ${nonComplete} non-complete stories are blocked`,
      storySummary: summary,
    };
  }

  // Rule 5: Default -> not-started.
  return {
    derivedStatus: 'not-started',
    reason: `${summary.notStarted} stories not started, ${summary.draft} in draft`,
    storySummary: summary,
  };
}

/**
 * Batch-derive statuses for multiple epics.
 * Groups stories by epic and derives each epic's status.
 *
 * @param epicStories - Map of epic ID to its child stories
 * @returns Map of epic ID to derived status
 */
export function batchDeriveEpicStatuses(
  epicStories: Map<string, EpicStoryInfo[]>,
): Map<string, EpicStatusDerivation> {
  const results = new Map<string, EpicStatusDerivation>();

  for (const [epicId, stories] of epicStories) {
    results.set(epicId, deriveEpicStatus(stories));
  }

  return results;
}
```

## Acceptance Criteria

- [ ] `deriveEpicStatus()` returns `"complete"` when all child stories are complete
- [ ] `deriveEpicStatus()` returns `"failed"` when any story is failed and none are in-progress
- [ ] `deriveEpicStatus()` returns `"in-progress"` when any story is in-progress (even if others are failed)
- [ ] `deriveEpicStatus()` returns `"blocked"` when all non-complete stories are blocked
- [ ] `deriveEpicStatus()` returns `"not-started"` as the default state
- [ ] Empty epics (no stories) return `"not-started"`
- [ ] The `storySummary` accurately counts stories in each status
- [ ] All derivation results include a human-readable reason
- [ ] `batchDeriveEpicStatuses()` correctly derives statuses for multiple epics
- [ ] "In-progress" takes precedence over "failed" (active work supersedes failure state)
- [ ] Draft stories are counted in the summary but do not trigger any specific epic status
- [ ] All functions are pure — no side effects, no database calls
- [ ] No `any` types used

## Technical Notes

- The priority order of rules is critical. "In-progress" intentionally takes precedence over "failed" because if work is actively happening, the epic should show "in-progress" even if another story has failed. This prevents misleading "failed" status when the team is actively working on the epic.
- Draft stories are a special case. They count toward the total but don't directly influence the epic status in most rules. An epic with all stories in draft is "not-started" by the default rule.
- The `storySummary` field is included for UI display purposes (e.g., "3/5 stories complete") and for debugging. It adds minimal overhead since the counts are computed as part of the derivation.
- The `batchDeriveEpicStatuses()` function is a convenience for computing all epic statuses in a project at once, useful for dashboard views.
- Consider adding an `epicProgress` computed field (e.g., `complete / total * 100`) for progress bar display.

## References

- **Functional Requirements:** FR-STATUS-030 (epic status derivation), FR-STATUS-031 (priority rules)
- **Design Specification:** Section 5.2.8 (Epic Status Derivation), Section 5.2.9 (Status Summary)
- **Project Setup:** Domain package structure, pure function conventions

## Estimated Complexity

Small — The derivation logic is a straightforward priority-ordered evaluation of story status counts. The main nuance is getting the priority order correct (especially the "in-progress supersedes failed" rule). The types and summary computation are simple.
