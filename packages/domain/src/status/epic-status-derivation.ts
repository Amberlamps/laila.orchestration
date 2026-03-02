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
 * Summary of child story statuses for debugging/display.
 */
export interface StorySummary {
  total: number;
  complete: number;
  inProgress: number;
  failed: number;
  blocked: number;
  notStarted: number;
  draft: number;
}

/**
 * Result of epic status derivation with explanation.
 */
export interface EpicStatusDerivation {
  derivedStatus: EpicStatus;
  reason: string;
  storySummary: StorySummary;
}

/**
 * Build a summary counting stories in each status.
 */
const buildStorySummary = (stories: readonly EpicStoryInfo[]): StorySummary => {
  const summary: StorySummary = {
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

  return summary;
};

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
export const deriveEpicStatus = (stories: readonly EpicStoryInfo[]): EpicStatusDerivation => {
  const summary = buildStorySummary(stories);

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
      reason: `All ${String(summary.total)} stories are complete`,
      storySummary: summary,
    };
  }

  // Rule 2: Any failed AND none in-progress -> epic is failed.
  // The "none in-progress" condition ensures we don't mark an epic
  // as failed while work is still actively happening on other stories.
  if (summary.failed > 0 && summary.inProgress === 0) {
    return {
      derivedStatus: 'failed',
      reason: `${String(summary.failed)} ${summary.failed === 1 ? 'story' : 'stories'} failed, no stories in progress`,
      storySummary: summary,
    };
  }

  // Rule 3: Any in-progress -> epic is in-progress.
  // This intentionally takes precedence over failed — active work supersedes failure state.
  if (summary.inProgress > 0) {
    return {
      derivedStatus: 'in-progress',
      reason: `${String(summary.inProgress)} ${summary.inProgress === 1 ? 'story' : 'stories'} in progress`,
      storySummary: summary,
    };
  }

  // Rule 4: All non-complete stories are blocked -> epic is blocked.
  const nonComplete = summary.total - summary.complete;
  if (nonComplete > 0 && summary.blocked === nonComplete) {
    return {
      derivedStatus: 'blocked',
      reason: `All ${String(nonComplete)} non-complete ${nonComplete === 1 ? 'story is' : 'stories are'} blocked`,
      storySummary: summary,
    };
  }

  // Rule 5: Default -> not-started.
  return {
    derivedStatus: 'not-started',
    reason: `${String(summary.notStarted)} ${summary.notStarted === 1 ? 'story' : 'stories'} not started, ${String(summary.draft)} in draft`,
    storySummary: summary,
  };
};

/**
 * Batch-derive statuses for multiple epics.
 * Groups stories by epic and derives each epic's status.
 *
 * @param epicStories - Map of epic ID to its child stories
 * @returns Map of epic ID to derived status
 */
export const batchDeriveEpicStatuses = (
  epicStories: ReadonlyMap<string, readonly EpicStoryInfo[]>,
): Map<string, EpicStatusDerivation> => {
  const results = new Map<string, EpicStatusDerivation>();

  for (const [epicId, stories] of epicStories) {
    results.set(epicId, deriveEpicStatus(stories));
  }

  return results;
};
