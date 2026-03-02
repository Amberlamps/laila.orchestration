/**
 * @module @laila/domain/status
 *
 * Status transition state machines and derived status computation.
 *
 * This module contains finite state machines that govern project lifecycle
 * and work status transitions. It defines valid state transitions, guards
 * against invalid transitions, and computes derived status values from
 * the current state of tasks and their dependencies.
 *
 * All functions are pure with no side effects -- status computations
 * are deterministic transformations of input state.
 */

export type {
  TaskStatus,
  UserStoryStatus,
  EpicStatus,
  ProjectStatus,
  TransitionMap,
  TransitionValidationResult,
} from './transition-definitions';

export {
  TASK_TRANSITIONS,
  USER_STORY_TRANSITIONS,
  PROJECT_TRANSITIONS,
  validateTransition,
  getAllowedTransitions,
} from './transition-definitions';

export type { TaskCurrentState, TaskStatusDetermination } from './task-status-determination';

export {
  determineTaskStatus,
  determineInitialTaskStatus,
  batchDetermineTaskStatuses,
} from './task-status-determination';

export type {
  TaskState,
  UserStoryState,
  EpicState,
  StatusChangeCommand,
} from './cascading-reevaluation';

export { computeCascadingChanges, buildReverseDeps } from './cascading-reevaluation';

export type {
  StoryTaskInfo,
  CrossStoryDependency,
  StoryStatusDerivation,
} from './story-status-derivation';

export { deriveStoryStatus, findCrossStoryDependencies } from './story-status-derivation';

export type { EpicStoryInfo, StorySummary, EpicStatusDerivation } from './epic-status-derivation';

export { deriveEpicStatus, batchDeriveEpicStatuses } from './epic-status-derivation';
