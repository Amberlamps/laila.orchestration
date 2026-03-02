# Define Valid Status Transitions

## Task Details

- **Title:** Define Valid Status Transitions
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Status Transition Engine](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** None

## Description

Define all valid status transitions as finite state machines for tasks, user stories, epics, and projects. Each entity type has a specific set of states and allowed transitions between them. Invalid transitions must be rejected with clear error messages.

The state machines are defined as pure data structures (maps of allowed transitions) with a generic validation function that checks whether a proposed transition is valid.

### State Machines

#### Task Status Transitions

```
not-started --> in-progress --> complete
     ^                            |
     |                            | (if dependency re-added)
  blocked <--- (dep incomplete) --+
     |
     v
  not-started (when deps satisfied)
```

Valid transitions:

- `not-started` -> `in-progress` (work begins)
- `in-progress` -> `complete` (work finished)
- `blocked` -> `not-started` (all deps now satisfied)
- `not-started` -> `blocked` (new dep added that is incomplete)

#### User Story Status Transitions

```
draft --> not-started --> in-progress --> complete
  |           |                             |
  |           v                             v
  |        blocked ----> not-started      failed --> not-started
  |                                         |         |
  |                                         v         v
  +-------------------------------------> blocked    blocked
```

Valid transitions:

- `draft` -> `not-started` (story ready, cross-story deps satisfied)
- `draft` -> `blocked` (story ready but cross-story deps not satisfied)
- `not-started` -> `in-progress` (story assigned to a worker)
- `not-started` -> `blocked` (cross-story dep became unsatisfied)
- `in-progress` -> `complete` (all tasks complete)
- `in-progress` -> `failed` (explicitly marked as failed)
- `blocked` -> `not-started` (cross-story deps now satisfied)
- `failed` -> `not-started` (retry, deps satisfied)
- `failed` -> `blocked` (retry, but deps not satisfied)

#### Project Status Transitions

```
draft --> ready --> in-progress --> complete
           |
           v
         draft (edit mode)
```

Valid transitions:

- `draft` -> `ready` (project finalized, ready for work)
- `ready` -> `draft` (edit mode, pause work assignment)
- `ready` -> `in-progress` (first story assigned)
- `in-progress` -> `complete` (all stories complete)

#### Epic Status (Derived, No Direct Transitions)

Epic status is computed from child stories — there are no direct transitions. See `implement-epic-status-derivation` task.

```typescript
// packages/domain/src/status/transition-definitions.ts
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
type TransitionMap<S extends string> = Record<S, readonly S[]>;

/**
 * Valid task status transitions.
 * Tasks follow a linear progression with a blocked side-state.
 */
export const TASK_TRANSITIONS: TransitionMap<TaskStatus> = {
  'not-started': ['in-progress', 'blocked'],
  'in-progress': ['complete'],
  complete: [], // Terminal state — tasks cannot be un-completed.
  blocked: ['not-started'],
} as const;

/**
 * Valid user story status transitions.
 * Stories have a richer state machine with draft, failed, and retry paths.
 */
export const USER_STORY_TRANSITIONS: TransitionMap<UserStoryStatus> = {
  draft: ['not-started', 'blocked'],
  'not-started': ['in-progress', 'blocked'],
  'in-progress': ['complete', 'failed'],
  complete: [], // Terminal state.
  failed: ['not-started', 'blocked'],
  blocked: ['not-started'],
} as const;

/**
 * Valid project status transitions.
 * Projects have a simple lifecycle with an edit-mode loop.
 */
export const PROJECT_TRANSITIONS: TransitionMap<ProjectStatus> = {
  draft: ['ready'],
  ready: ['draft', 'in-progress'],
  'in-progress': ['complete'],
  complete: [], // Terminal state.
} as const;

/**
 * Result of a transition validation check.
 */
export type TransitionValidationResult =
  | { valid: true; from: string; to: string }
  | { valid: false; from: string; to: string; reason: string };

/**
 * Validate whether a status transition is allowed.
 * Generic function that works with any entity type's transition map.
 *
 * @param transitionMap - The valid transitions for this entity type
 * @param currentStatus - The entity's current status
 * @param targetStatus - The proposed new status
 * @returns Validation result
 */
export function validateTransition<S extends string>(
  transitionMap: TransitionMap<S>,
  currentStatus: S,
  targetStatus: S,
): TransitionValidationResult {
  const allowedTargets = transitionMap[currentStatus];

  if (!allowedTargets) {
    return {
      valid: false,
      from: currentStatus,
      to: targetStatus,
      reason: `Unknown status: "${currentStatus}"`,
    };
  }

  if (!allowedTargets.includes(targetStatus)) {
    return {
      valid: false,
      from: currentStatus,
      to: targetStatus,
      reason: `Transition from "${currentStatus}" to "${targetStatus}" is not allowed. Valid targets: [${allowedTargets.join(', ')}]`,
    };
  }

  return { valid: true, from: currentStatus, to: targetStatus };
}
```

## Acceptance Criteria

- [ ] `TaskStatus` type includes: "not-started", "in-progress", "complete", "blocked"
- [ ] `UserStoryStatus` type includes: "draft", "not-started", "in-progress", "complete", "failed", "blocked"
- [ ] `EpicStatus` type includes: "not-started", "in-progress", "complete", "failed", "blocked"
- [ ] `ProjectStatus` type includes: "draft", "ready", "in-progress", "complete"
- [ ] `TASK_TRANSITIONS` defines all valid task state transitions
- [ ] `USER_STORY_TRANSITIONS` defines all valid user story state transitions
- [ ] `PROJECT_TRANSITIONS` defines all valid project state transitions
- [ ] `validateTransition()` accepts valid transitions and rejects invalid ones
- [ ] Invalid transition results include a human-readable reason with the allowed targets
- [ ] Terminal states ("complete" for tasks/stories/projects) have no outgoing transitions
- [ ] All transition maps use `as const` for TypeScript literal type inference
- [ ] The generic `validateTransition()` function works with all entity type transition maps
- [ ] All types and constants are properly exported
- [ ] No `any` types used

## Technical Notes

- The transition maps are defined as `Record<S, readonly S[]>` to get TypeScript's help in ensuring all states are covered. If a state is missing from the record, TypeScript will produce a compile error.
- Using `as const` on the transition maps enables TypeScript to infer literal types for the allowed transitions, which can be used for more precise type checking downstream.
- Epic status is intentionally NOT in the transition maps because it is derived (computed from child stories), not directly transitioned. The epic status derivation is a separate task.
- The `validateTransition()` function is generic so it can be reused across entity types without duplication. TypeScript's type parameter `S` is inferred from the transition map.
- Consider adding a `getAllowedTransitions()` helper that returns the valid target states for a given current state. This is useful for UI dropdowns that show only valid next states.

## References

- **Functional Requirements:** FR-STATUS-001 (task transitions), FR-STATUS-002 (story transitions), FR-STATUS-003 (project transitions)
- **Design Specification:** Section 5.2 (Status Transition Engine), Section 5.2.1 (State Machine Definitions)
- **Project Setup:** Domain package structure, TypeScript const assertions

## Estimated Complexity

Small — The state machine definitions are straightforward data structures. The generic validation function is simple. The main value is in the completeness and correctness of the transition maps, which requires careful review against the specification.
