/**
 * @module @laila/domain/assignment
 *
 * Work assignment engine: eligibility rules, story selection,
 * task ordering, and optimistic locking for concurrent modifications.
 *
 * This module determines which user stories are eligible for assignment
 * to execution agents, computes recommended task execution order,
 * and provides optimistic locking utilities for safe concurrent updates.
 *
 * All functions are pure with no side effects — eligibility decisions,
 * task ordering, and version checks are deterministic transformations
 * of input state.
 */

export type {
  ProjectInfo,
  EpicInfo,
  StoryEligibilityInfo,
  EligibilityResult,
} from './eligibility-rules';

export { evaluateEligibility, getEligibleStoryIds } from './eligibility-rules';

export type { TaskOrderInfo, RecommendedTaskOrder } from './recommended-task-order';
export { computeRecommendedTaskOrder, getNextReadyTasks } from './recommended-task-order';

export type { ConflictCheckResult, RetryGuidance } from './optimistic-locking';
export {
  checkVersionConflict,
  generateRetryGuidance,
  nextVersion,
  buildConflictResponse,
  isValidVersion,
} from './optimistic-locking';

export type { PriorityLevel, StorySelectionInfo, SelectionResult } from './priority-selection';

export {
  PRIORITY_VALUES,
  selectStoryForAssignment,
  rankEligibleStories,
} from './priority-selection';
