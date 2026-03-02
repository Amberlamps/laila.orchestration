# Implement Eligibility Rules

## Task Details

- **Title:** Implement Eligibility Rules
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Work Assignment Engine](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a pure function that determines which user stories are eligible for assignment to an execution agent. A story is eligible when it meets all of the following conditions:

1. **Story lifecycle:** The story must be in `not-started` status (derived from `Ready` lifecycle, meaning all cross-story dependencies are satisfied)
2. **Parent epic lifecycle:** The epic containing the story must be in `not-started` or `in-progress` status (not blocked, failed, or draft)
3. **Cross-story dependencies satisfied:** All tasks in the story that depend on tasks in other stories must have their external dependencies complete
4. **Not already assigned:** The story must not be `in-progress` or `failed` (not already being worked on or previously failed)
5. **Project state:** The parent project must be in `ready` or `in-progress` state (not draft or complete)

```typescript
// packages/domain/src/assignment/eligibility-rules.ts
// Determines which user stories are eligible for assignment.
// A story is eligible when its lifecycle, dependencies, parent epic,
// and project state all permit assignment.
// Pure function: no database calls, no side effects.
import type { UserStoryStatus, EpicStatus, ProjectStatus } from '../status/transition-definitions';

/**
 * Minimal project information needed for eligibility checking.
 */
export interface ProjectInfo {
  id: string;
  status: ProjectStatus;
}

/**
 * Minimal epic information needed for eligibility checking.
 */
export interface EpicInfo {
  id: string;
  status: EpicStatus;
}

/**
 * User story information needed for eligibility checking.
 */
export interface StoryEligibilityInfo {
  id: string;
  status: UserStoryStatus;
  epicId: string;
  /** Whether all cross-story task dependencies are satisfied */
  crossStoryDepsSatisfied: boolean;
}

/**
 * Result of an eligibility check for a single story.
 */
export interface EligibilityResult {
  storyId: string;
  eligible: boolean;
  /** If not eligible, the specific reason(s) why */
  disqualificationReasons: string[];
}

/**
 * Determine which user stories are eligible for assignment.
 *
 * Evaluates each story against all eligibility criteria and returns
 * the full list with eligibility status and disqualification reasons.
 * The caller can filter to only eligible stories.
 *
 * @param stories - All user stories in the project
 * @param epics - All epics in the project (for parent epic status check)
 * @param project - The project (for project state check)
 * @returns Eligibility result for each story
 */
export function evaluateEligibility(
  stories: StoryEligibilityInfo[],
  epics: Map<string, EpicInfo>,
  project: ProjectInfo,
): EligibilityResult[] {
  return stories.map((story) => {
    const reasons: string[] = [];

    // Rule 1: Project must be in ready or in-progress state.
    if (project.status !== 'ready' && project.status !== 'in-progress') {
      reasons.push(`Project is in "${project.status}" state — must be "ready" or "in-progress"`);
    }

    // Rule 2: Story must be in not-started status.
    if (story.status !== 'not-started') {
      reasons.push(`Story is in "${story.status}" status — must be "not-started"`);
    }

    // Rule 3: Parent epic must be in not-started or in-progress status.
    const parentEpic = epics.get(story.epicId);
    if (!parentEpic) {
      reasons.push(`Parent epic "${story.epicId}" not found`);
    } else if (parentEpic.status !== 'not-started' && parentEpic.status !== 'in-progress') {
      reasons.push(
        `Parent epic is "${parentEpic.status}" — must be "not-started" or "in-progress"`,
      );
    }

    // Rule 4: Cross-story dependencies must be satisfied.
    if (!story.crossStoryDepsSatisfied) {
      reasons.push('Cross-story task dependencies are not yet satisfied');
    }

    return {
      storyId: story.id,
      eligible: reasons.length === 0,
      disqualificationReasons: reasons,
    };
  });
}

/**
 * Convenience function that returns only the eligible stories.
 *
 * @param stories - All user stories in the project
 * @param epics - All epics in the project
 * @param project - The project info
 * @returns Only the eligible story IDs
 */
export function getEligibleStoryIds(
  stories: StoryEligibilityInfo[],
  epics: Map<string, EpicInfo>,
  project: ProjectInfo,
): string[] {
  return evaluateEligibility(stories, epics, project)
    .filter((result) => result.eligible)
    .map((result) => result.storyId);
}
```

## Acceptance Criteria

- [ ] `evaluateEligibility()` returns eligible for stories meeting all criteria
- [ ] Stories with non-ready project state are disqualified with reason
- [ ] Stories not in `not-started` status are disqualified with reason
- [ ] Stories with blocked/failed/draft parent epic are disqualified with reason
- [ ] Stories with unsatisfied cross-story dependencies are disqualified with reason
- [ ] Multiple disqualification reasons are collected (not short-circuited)
- [ ] `getEligibleStoryIds()` returns only the IDs of eligible stories
- [ ] Missing parent epic is handled gracefully (disqualified with reason)
- [ ] All disqualification reasons are human-readable
- [ ] All functions are pure — no side effects, no database calls
- [ ] All types are properly exported
- [ ] No `any` types used

## Technical Notes

- The `crossStoryDepsSatisfied` field is pre-computed by the caller using `findCrossStoryDependencies()` from the story status derivation module. This keeps the eligibility function focused on checking boolean conditions rather than traversing the DAG.
- The eligibility check collects ALL disqualification reasons rather than short-circuiting on the first failure. This gives the API consumer (and the UI) complete information about why a story is not eligible.
- Consider adding a `StoryEligibilitySummary` type that counts eligible/ineligible stories and groups disqualification reasons by category. This is useful for dashboard views.
- The `getEligibleStoryIds()` convenience function is useful for callers that only need the eligible list without the detailed reasons.

## References

- **Functional Requirements:** FR-ASSIGN-001 (story eligibility rules), FR-ASSIGN-002 (eligibility criteria)
- **Design Specification:** Section 5.3 (Work Assignment Engine), Section 5.3.1 (Eligibility Rules)
- **Project Setup:** Domain package structure, pure function conventions

## Estimated Complexity

Small — The eligibility rules are straightforward boolean checks against the story, epic, and project states. The main design effort is in the return type that provides detailed disqualification reasons.
