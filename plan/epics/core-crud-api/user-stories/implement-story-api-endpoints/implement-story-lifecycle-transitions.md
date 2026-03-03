# Implement Story Lifecycle Transitions

## Task Details

- **Title:** Implement Story Lifecycle Transitions
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement User Story API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** Implement Story CRUD Routes

## Description

Implement lifecycle transition endpoints for user stories: publish (Draft to Ready), reset (Failed to not-started/blocked), and unassign (manual worker removal). These transitions manage the editorial and operational lifecycle of stories, complementing the system-driven transitions (assignment, completion, failure) in Epic 7.

### Transition Endpoints

```typescript
// pages/api/v1/projects/[projectId]/epics/[epicId]/stories/[id]/publish.ts
// Transitions a story from Draft to Ready status.
// Validates that tasks have required fields (persona, acceptance criteria).

/**
 * POST /api/v1/projects/:projectId/epics/:epicId/stories/:id/publish
 *
 * Pre-conditions:
 *   - Story must be in Draft status
 *   - Story must have at least one task
 *   - All tasks must have a persona reference assigned
 *   - All tasks must have at least one acceptance criterion
 *
 * Post-conditions:
 *   - Story editorial status changes to Ready
 *   - Story is eligible to participate in epic publish validation
 *
 * Errors:
 *   - 409 INVALID_STATUS_TRANSITION if story is not in Draft
 *   - 400 VALIDATION_FAILED with details of incomplete tasks
 */
```

```typescript
// pages/api/v1/projects/[projectId]/epics/[epicId]/stories/[id]/reset.ts
// Resets a failed story back to not-started or blocked (system-determined).
// Human auth only. Clears assignment and logs the previous attempt.

/**
 * POST /api/v1/projects/:projectId/epics/:epicId/stories/:id/reset
 *
 * Pre-conditions:
 *   - Story must be in Failed status
 *   - Only human auth (not worker auth)
 *
 * Post-conditions:
 *   - Story status changes to not-started or blocked (determined by DAG state)
 *   - Assigned worker is cleared
 *   - Previous attempt is logged in attempt history
 *   - Story re-enters the assignment pool
 *
 * The DAG determines the new status:
 *   - If all upstream dependencies are complete: not-started
 *   - If any upstream dependency is incomplete: blocked
 */
```

```typescript
// pages/api/v1/projects/[projectId]/epics/[epicId]/stories/[id]/unassign.ts
// Manually unassigns a worker from a story. Human auth only.
// Logs the previous attempt with reason "manual_unassignment".

/**
 * POST /api/v1/projects/:projectId/epics/:epicId/stories/:id/unassign
 *
 * Pre-conditions:
 *   - Story must be in in-progress status (has an assigned worker)
 *   - Only human auth (not worker auth)
 *   - Body: { confirmation: true } (explicit confirmation required)
 *
 * Post-conditions:
 *   - Worker assignment is cleared
 *   - Story status changes to not-started or blocked (DAG-determined)
 *   - All in-progress tasks within the story are reset to not-started
 *   - Previous attempt is logged with reason "manual_unassignment"
 *   - Story re-enters the assignment pool
 */
```

## Acceptance Criteria

- [ ] `POST .../publish` transitions Draft story to Ready
- [ ] Publish validates that the story has at least one task
- [ ] Publish validates that all tasks have a persona reference
- [ ] Publish validates that all tasks have at least one acceptance criterion
- [ ] Publish returns 400 with details of incomplete tasks (task IDs and missing fields)
- [ ] `POST .../reset` transitions Failed story to not-started or blocked
- [ ] Reset determines the correct status using DAG dependency analysis
- [ ] Reset clears the assigned worker field
- [ ] Reset creates an attempt history record with the previous attempt details
- [ ] Reset requires human auth only (worker auth rejected with 403)
- [ ] `POST .../unassign` removes worker assignment from in-progress story
- [ ] Unassign requires `{ confirmation: true }` in the request body
- [ ] Unassign returns 400 if confirmation is not provided
- [ ] Unassign resets all in-progress tasks within the story to not-started
- [ ] Unassign logs the previous attempt with reason "manual_unassignment"
- [ ] Unassign requires human auth only
- [ ] All transitions use domain logic for status determination
- [ ] No `any` types are used in the implementation

## Technical Notes

- The reset and unassign operations both write to the attempt history table. An attempt record captures: story ID, worker ID, started timestamp, ended timestamp, reason (failed/timeout/manual_unassignment), error message (for failures), and cost data (if any work was done before failure).
- The DAG-determined status after reset/unassign uses the domain logic function `determineStoryStatus(storyTasks, upstreamDependencies)` which checks whether all upstream task dependencies are complete.
- The unassign operation is destructive — it discards any in-progress work the worker may have done. The confirmation requirement prevents accidental unassignment.
- Consider sending a notification to the worker when they are manually unassigned (future enhancement, not v1).

## References

- **Functional Requirements:** FR-STORY-004 (story publish), FR-STORY-005 (story reset), FR-STORY-006 (manual unassignment)
- **Design Specification:** Section 7.3.2 (Story Lifecycle Transitions)
- **Domain Logic:** `determineStoryStatus()` from `@laila/domain`, DAG dependency analysis
- **Database Schema:** attempt_history table in `@laila/database`

## Estimated Complexity

High — The reset and unassign operations involve multiple database writes (story update, task resets, attempt history creation), DAG analysis for status determination, and careful coordination. The publish validation requires querying all tasks and checking multiple fields.
