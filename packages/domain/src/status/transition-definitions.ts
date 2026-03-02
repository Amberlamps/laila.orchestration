// Finite state machine definitions for all entity status transitions.
// Each entity type has a set of valid states and allowed transitions.
// These are pure data definitions — no logic, no side effects.

/**
 * Task statuses. Tasks are the atomic unit of work.
 */
export type TaskStatus = 'not-started' | 'in-progress' | 'complete' | 'blocked';

/**
 * User story statuses. Stories aggregate tasks and are assigned to workers.
 */
export type UserStoryStatus =
  | 'draft'
  | 'not-started'
  | 'in-progress'
  | 'complete'
  | 'failed'
  | 'blocked';

/**
 * Epic statuses. Epics aggregate stories. Status is derived, not set directly.
 */
export type EpicStatus = 'not-started' | 'in-progress' | 'complete' | 'failed' | 'blocked';

/**
 * Project statuses. Projects are the top-level container.
 */
export type ProjectStatus = 'draft' | 'ready' | 'in-progress' | 'complete';

/**
 * A transition map defines which target states are reachable
 * from each source state. Used for validation.
 */
export type TransitionMap<S extends string> = Record<S, readonly S[]>;

/**
 * Valid task status transitions.
 * Tasks follow a linear progression with a blocked side-state.
 *
 * - `not-started` -> `in-progress` (work begins)
 * - `not-started` -> `blocked` (new dep added that is incomplete)
 * - `in-progress` -> `complete` (work finished)
 * - `blocked` -> `not-started` (all deps now satisfied)
 * - `complete` is terminal — tasks cannot be un-completed.
 */
export const TASK_TRANSITIONS: TransitionMap<TaskStatus> = {
  'not-started': ['in-progress', 'blocked'],
  'in-progress': ['complete'],
  complete: [],
  blocked: ['not-started'],
} as const;

/**
 * Valid user story status transitions.
 * Stories have a richer state machine with draft, failed, and retry paths.
 *
 * - `draft` -> `not-started` (story ready, cross-story deps satisfied)
 * - `draft` -> `blocked` (story ready but cross-story deps not satisfied)
 * - `not-started` -> `in-progress` (story assigned to a worker)
 * - `not-started` -> `blocked` (cross-story dep became unsatisfied)
 * - `in-progress` -> `complete` (all tasks complete)
 * - `in-progress` -> `failed` (explicitly marked as failed)
 * - `blocked` -> `not-started` (cross-story deps now satisfied)
 * - `failed` -> `not-started` (retry, deps satisfied)
 * - `failed` -> `blocked` (retry, but deps not satisfied)
 * - `complete` is terminal.
 */
export const USER_STORY_TRANSITIONS: TransitionMap<UserStoryStatus> = {
  draft: ['not-started', 'blocked'],
  'not-started': ['in-progress', 'blocked'],
  'in-progress': ['complete', 'failed'],
  complete: [],
  failed: ['not-started', 'blocked'],
  blocked: ['not-started'],
} as const;

/**
 * Valid project status transitions.
 * Projects have a simple lifecycle with an edit-mode loop.
 *
 * - `draft` -> `ready` (project finalized, ready for work)
 * - `ready` -> `draft` (edit mode, pause work assignment)
 * - `ready` -> `in-progress` (first story assigned)
 * - `in-progress` -> `complete` (all stories complete)
 * - `complete` is terminal.
 */
export const PROJECT_TRANSITIONS: TransitionMap<ProjectStatus> = {
  draft: ['ready'],
  ready: ['draft', 'in-progress'],
  'in-progress': ['complete'],
  complete: [],
} as const;

/**
 * Result of a transition validation check.
 * Discriminated union: `valid: true` means the transition is allowed,
 * `valid: false` includes a human-readable reason.
 */
export type TransitionValidationResult<S extends string = string> =
  | { valid: true; from: S; to: S }
  | { valid: false; from: S; to: S; reason: string };

/**
 * Validate whether a status transition is allowed.
 * Generic function that works with any entity type's transition map.
 *
 * @param transitionMap - The valid transitions for this entity type
 * @param currentStatus - The entity's current status
 * @param targetStatus - The proposed new status
 * @returns Validation result with `valid: true` or `valid: false` with reason
 */
export const validateTransition = <S extends string>(
  transitionMap: TransitionMap<S>,
  currentStatus: S,
  targetStatus: S,
): TransitionValidationResult<S> => {
  const allowedTargets = transitionMap[currentStatus];

  if (allowedTargets.includes(targetStatus)) {
    return { valid: true, from: currentStatus, to: targetStatus };
  }

  const targets = allowedTargets.length > 0 ? allowedTargets.join(', ') : 'none (terminal state)';

  return {
    valid: false,
    from: currentStatus,
    to: targetStatus,
    reason: `Transition from "${currentStatus}" to "${targetStatus}" is not allowed. Valid targets: [${targets}]`,
  };
};

/**
 * Get the list of valid target states for a given current state.
 * Useful for UI dropdowns that show only valid next states.
 *
 * @param transitionMap - The valid transitions for this entity type
 * @param currentStatus - The entity's current status
 * @returns Readonly array of allowed target states, or empty array if unknown/terminal
 */
export const getAllowedTransitions = <S extends string>(
  transitionMap: TransitionMap<S>,
  currentStatus: S,
): readonly S[] => {
  return transitionMap[currentStatus];
};
