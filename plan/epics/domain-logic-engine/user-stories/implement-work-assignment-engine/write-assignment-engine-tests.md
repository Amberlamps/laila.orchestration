# Write Assignment Engine Tests

## Task Details

- **Title:** Write Assignment Engine Tests
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Work Assignment Engine](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** Implement Eligibility Rules, Implement Priority-Based Selection, Implement Recommended Task Order, Implement Optimistic Locking Logic

## Description

Write exhaustive tests for the entire work assignment engine: eligibility rules, priority-based selection, recommended task order, and optimistic locking logic. This is **safety-critical** code — assignment correctness is the highest priority for the orchestration system.

### Test Groups

#### 1. Eligibility Rules Tests

```typescript
// packages/domain/src/tests/assignment/eligibility-rules.test.ts
// Exhaustive tests for story eligibility evaluation.
import { describe, it, expect } from 'vitest';
import {
  evaluateEligibility,
  getEligibleStoryIds,
  type StoryEligibilityInfo,
  type EpicInfo,
  type ProjectInfo,
} from '@/assignment/eligibility-rules';

describe('evaluateEligibility', () => {
  // Helper to create test data with sensible defaults.
  function createTestProject(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
    return { id: 'project-1', status: 'ready', ...overrides };
  }

  function createTestEpic(overrides: Partial<EpicInfo> = {}): EpicInfo {
    return { id: 'epic-1', status: 'not-started', ...overrides };
  }

  function createTestStory(overrides: Partial<StoryEligibilityInfo> = {}): StoryEligibilityInfo {
    return {
      id: 'story-1',
      status: 'not-started',
      epicId: 'epic-1',
      crossStoryDepsSatisfied: true,
      ...overrides,
    };
  }

  describe('happy path', () => {
    it('should mark story as eligible when all criteria are met', () => {
      const stories = [createTestStory()];
      const epics = new Map([['epic-1', createTestEpic()]]);
      const project = createTestProject();

      const results = evaluateEligibility(stories, epics, project);

      expect(results[0].eligible).toBe(true);
      expect(results[0].disqualificationReasons).toHaveLength(0);
    });
  });

  describe('project state restrictions', () => {
    it('should disqualify when project is in draft state', () => {
      const project = createTestProject({ status: 'draft' });
      const results = evaluateEligibility(
        [createTestStory()],
        new Map([['epic-1', createTestEpic()]]),
        project,
      );
      expect(results[0].eligible).toBe(false);
      expect(results[0].disqualificationReasons).toContainEqual(expect.stringContaining('draft'));
    });

    it('should disqualify when project is complete', () => {});
    it('should allow when project is in-progress', () => {});
  });

  describe('story status restrictions', () => {
    it('should disqualify in-progress stories', () => {});
    it('should disqualify blocked stories', () => {});
    it('should disqualify failed stories', () => {});
    it('should disqualify draft stories', () => {});
    it('should disqualify complete stories', () => {});
  });

  describe('epic status restrictions', () => {
    it('should disqualify when parent epic is blocked', () => {});
    it('should disqualify when parent epic is failed', () => {});
    it('should allow when parent epic is in-progress', () => {});
    it('should handle missing parent epic', () => {});
  });

  describe('cross-story dependencies', () => {
    it('should disqualify when cross-story deps are not satisfied', () => {});
    it('should allow when cross-story deps are satisfied', () => {});
  });

  describe('multiple disqualification reasons', () => {
    it('should collect all reasons when multiple criteria fail', () => {
      // Story in wrong status AND project in wrong state AND epic blocked
      // Assert: all three reasons are present
    });
  });
});
```

#### 2. Priority-Based Selection Tests

```typescript
// packages/domain/src/tests/assignment/priority-selection.test.ts
import { describe, it, expect } from 'vitest';
import {
  selectStoryForAssignment,
  rankEligibleStories,
  type StorySelectionInfo,
} from '@/assignment/priority-selection';

describe('selectStoryForAssignment', () => {
  it('should select high priority over medium priority', () => {
    // Two eligible stories: one high, one medium
    // Assert: high priority story is selected
  });

  it('should select medium priority over low priority', () => {});

  it('should use topological order as tiebreaker for same priority', () => {
    // Two high-priority stories at different topo positions
    // Assert: earlier topo position is selected
  });

  it('should use creation time as final tiebreaker', () => {
    // Two high-priority stories at same topo position
    // Assert: older story is selected
  });

  it('should return selected: false when no eligible stories', () => {
    const result = selectStoryForAssignment([], new Map(), []);
    expect(result.selected).toBe(false);
  });

  it('should handle single eligible story', () => {});

  it('should handle stories not in topological order (Infinity position)', () => {
    // Story not in topo sort should be ranked after stories in topo sort
  });
});

describe('rankEligibleStories', () => {
  it('should return all stories sorted by priority, topo order, then creation time', () => {
    // Multiple stories with various priorities and positions
    // Assert: sorted correctly
  });

  it('should return empty array for no eligible stories', () => {});
});
```

#### 3. Recommended Task Order Tests

```typescript
// packages/domain/src/tests/assignment/recommended-task-order.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeRecommendedTaskOrder,
  getNextReadyTasks,
} from '@/assignment/recommended-task-order';
import { buildAdjacencyList } from '@/dag/cycle-detection';

describe('computeRecommendedTaskOrder', () => {
  it('should order tasks respecting dependencies', () => {
    // A -> B -> C (linear chain)
    // Assert: orderedTasks is [A, B, C]
  });

  it('should classify ready tasks correctly', () => {
    // A -> C, B -> C. A and B have no deps.
    // Assert: readyNow includes A and B, blocked includes C
  });

  it('should classify completed tasks', () => {
    // A is complete, B depends on A
    // Assert: completed includes A, readyNow includes B
  });

  it('should classify in-progress tasks', () => {
    // A is in-progress
    // Assert: inProgress includes A
  });

  it('should handle story with all tasks complete', () => {
    // Assert: readyNow is empty, completed has all tasks
  });

  it('should handle story with no dependencies (all tasks ready)', () => {
    // Three tasks, no deps between them
    // Assert: all in readyNow
  });

  it('should handle empty story', () => {
    const result = computeRecommendedTaskOrder([], new Map(), new Map());
    expect(result.orderedTasks).toHaveLength(0);
    expect(result.readyNow).toHaveLength(0);
  });

  it('should only consider intra-story dependencies for readiness', () => {
    // Task A depends on external Task X (in another story)
    // Task A should be in readyNow if all intra-story deps are satisfied
    // (cross-story deps handled at story eligibility level)
  });
});
```

#### 4. Optimistic Locking Tests

```typescript
// packages/domain/src/tests/assignment/optimistic-locking.test.ts
import { describe, it, expect } from 'vitest';
import {
  checkVersionConflict,
  generateRetryGuidance,
  nextVersion,
  buildConflictResponse,
  isValidVersion,
} from '@/assignment/optimistic-locking';

describe('checkVersionConflict', () => {
  it('should return no conflict when versions match', () => {
    const result = checkVersionConflict(1, 1);
    expect(result.conflict).toBe(false);
  });

  it('should detect conflict when versions differ', () => {
    const result = checkVersionConflict(1, 3);
    expect(result.conflict).toBe(true);
    if (result.conflict) {
      expect(result.expectedVersion).toBe(1);
      expect(result.actualVersion).toBe(3);
    }
  });
});

describe('generateRetryGuidance', () => {
  it('should recommend refetch-and-retry for small gaps', () => {
    const guidance = generateRetryGuidance(1, 2);
    expect(guidance.shouldRetry).toBe(true);
    expect(guidance.strategy).toBe('refetch-and-retry');
  });

  it('should recommend refetch-and-retry with warning for large gaps', () => {
    const guidance = generateRetryGuidance(1, 10);
    expect(guidance.shouldRetry).toBe(true);
    expect(guidance.explanation).toContain('out of date');
  });

  it('should recommend abort for invalid version state', () => {
    const guidance = generateRetryGuidance(5, 3);
    expect(guidance.shouldRetry).toBe(false);
    expect(guidance.strategy).toBe('abort');
  });
});

describe('isValidVersion', () => {
  it('should accept positive integers', () => {
    expect(isValidVersion(1)).toBe(true);
    expect(isValidVersion(100)).toBe(true);
  });

  it('should reject zero', () => {
    expect(isValidVersion(0)).toBe(false);
  });

  it('should reject negative numbers', () => {
    expect(isValidVersion(-1)).toBe(false);
  });

  it('should reject floats', () => {
    expect(isValidVersion(1.5)).toBe(false);
  });

  it('should reject non-numbers', () => {
    expect(isValidVersion('1')).toBe(false);
    expect(isValidVersion(null)).toBe(false);
    expect(isValidVersion(undefined)).toBe(false);
  });
});

describe('buildConflictResponse', () => {
  it('should produce a well-structured 409 error response', () => {
    const conflictResult = checkVersionConflict(1, 3);
    if (!conflictResult.conflict) throw new Error('Expected conflict');

    const response = buildConflictResponse('user-story', 'story-1', conflictResult);

    expect(response.error.code).toBe('VERSION_CONFLICT');
    expect(response.error.details.entityType).toBe('user-story');
    expect(response.error.details.entityId).toBe('story-1');
    expect(response.error.details.expectedVersion).toBe(1);
    expect(response.error.details.actualVersion).toBe(3);
    expect(response.error.details.retryGuidance).toBeDefined();
  });
});
```

#### 5. Integration Scenarios

```typescript
// packages/domain/src/tests/assignment/integration-scenarios.test.ts
// End-to-end scenarios that test the full assignment pipeline.

describe('Assignment Pipeline Integration', () => {
  it('scenario: single eligible story is selected and task order computed', () => {
    // 1. Create project with one epic, two stories, multiple tasks
    // 2. Evaluate eligibility -> one story eligible
    // 3. Select story -> the eligible story
    // 4. Compute task order -> correct dependency order
    // 5. Verify readyNow tasks are the ones with no deps
  });

  it('scenario: multiple eligible stories, highest priority selected', () => {
    // 1. Create project with multiple eligible stories at different priorities
    // 2. Evaluate eligibility -> multiple eligible
    // 3. Select story -> highest priority story
  });

  it('scenario: no eligible stories — all blocked', () => {
    // 1. Create project where all stories have unsatisfied cross-story deps
    // 2. Evaluate eligibility -> zero eligible
    // 3. Select story -> selected: false
  });

  it('scenario: all stories complete', () => {
    // 1. Create project where all stories are complete
    // 2. Evaluate eligibility -> zero eligible
  });

  it('scenario: concurrency conflict during assignment', () => {
    // 1. Agent A reads story at version 1
    // 2. Agent B reads story at version 1
    // 3. Agent A assigns story (version 1 -> 2)
    // 4. Agent B tries to assign (version 1 vs actual 2)
    // 5. Conflict detected, retry guidance provided
  });
});
```

## Acceptance Criteria

- [ ] Eligibility tests cover: all criteria met (eligible), each criterion failing individually (disqualified), multiple criteria failing (all reasons collected)
- [ ] Priority selection tests cover: priority comparison (high>medium>low), topological order tiebreaker, creation time tiebreaker, no eligible stories, single story, stories not in topo order
- [ ] Recommended task order tests cover: linear chains, parallel tasks, all complete, all ready, empty story, intra-story-only dep checking
- [ ] Optimistic locking tests cover: version match, conflict detection, small/large gap guidance, invalid version state, valid version validation, conflict response building
- [ ] Integration scenarios test the full pipeline: eligibility -> selection -> task order -> conflict handling
- [ ] All edge cases tested: empty inputs, single items, all items in same state, mixed states
- [ ] No `any` types used in test code — all test data uses typed helper functions
- [ ] Tests are isolated and do not share state between test cases
- [ ] All tests pass in CI
- [ ] Test coverage for the assignment engine exceeds 95% line coverage

## Technical Notes

- Use typed helper functions (like `createTestStory()`, `createTestEpic()`) instead of anonymous objects. This ensures all test data is well-typed and reduces repetition.
- For the integration scenarios, build complete project state objects (projects, epics, stories, tasks, DAG edges) and run the full pipeline. These serve as documentation of expected system behavior.
- The concurrency conflict scenario tests the optimistic locking functions in isolation (no actual database). It simulates the version sequence that would occur with concurrent agents.
- Consider adding a few property-based tests (with fast-check) for the eligibility rules: "a story that is eligible always becomes ineligible when any single criterion is violated."
- The recommended task order tests should use small, focused DAGs (3-5 tasks) to keep tests readable. Avoid large complex graphs in unit tests.
- All test helper functions should use the actual types from the source modules, not `as unknown as Type` casts.

## References

- **Functional Requirements:** FR-ASSIGN-040 (assignment engine test coverage), FR-TEST-002 (safety-critical testing)
- **Design Specification:** Section 5.3.8 (Assignment Testing Strategy), Section 8.1 (Test Infrastructure)
- **Project Setup:** Vitest configuration, test organization

## Estimated Complexity

Large — This is a comprehensive test suite covering four distinct modules plus integration scenarios. The eligibility rules alone have multiple dimensions (project state x story status x epic status x deps), producing a large test matrix. The integration scenarios require building complete project state objects. However, each individual test is straightforward — the complexity is in the breadth.
