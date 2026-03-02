# Write Status Engine Tests

## Task Details

- **Title:** Write Status Engine Tests
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Status Transition Engine](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** Define Valid Status Transitions, Implement Cascading Status Re-evaluation, Implement Task Status Determination, Implement Story Status Derivation, Implement Epic Status Derivation

## Description

Write exhaustive tests for the entire status transition engine: transition validation, cascading re-evaluation, task status determination, story status derivation, and epic status derivation. This is **safety-critical** code — the tests must cover all transition paths, invalid transitions, cascading propagation correctness, and edge cases.

### Test Groups

#### 1. Transition Validation Tests

```typescript
// packages/domain/src/tests/status/transition-validation.test.ts
// Exhaustive tests for status transition validation.
// Every valid transition is tested, and every invalid transition is rejected.
import { describe, it, expect } from "vitest";
import {
  validateTransition,
  TASK_TRANSITIONS,
  USER_STORY_TRANSITIONS,
  PROJECT_TRANSITIONS,
  type TaskStatus,
  type UserStoryStatus,
  type ProjectStatus,
} from "@/status/transition-definitions";

describe("Task Transition Validation", () => {
  // Test all VALID transitions
  const validTransitions: Array<[TaskStatus, TaskStatus]> = [
    ["not-started", "in-progress"],
    ["not-started", "blocked"],
    ["in-progress", "complete"],
    ["blocked", "not-started"],
  ];

  it.each(validTransitions)(
    "should accept transition from %s to %s",
    (from, to) => {
      const result = validateTransition(TASK_TRANSITIONS, from, to);
      expect(result.valid).toBe(true);
    }
  );

  // Test all INVALID transitions
  const invalidTransitions: Array<[TaskStatus, TaskStatus]> = [
    ["not-started", "complete"],     // Cannot skip in-progress
    ["in-progress", "not-started"],  // Cannot go back
    ["in-progress", "blocked"],      // Cannot block in-progress
    ["complete", "not-started"],     // Terminal state
    ["complete", "in-progress"],     // Terminal state
    ["complete", "blocked"],         // Terminal state
    ["blocked", "in-progress"],      // Must go through not-started
    ["blocked", "complete"],         // Must go through in-progress
  ];

  it.each(invalidTransitions)(
    "should reject transition from %s to %s",
    (from, to) => {
      const result = validateTransition(TASK_TRANSITIONS, from, to);
      expect(result.valid).toBe(false);
    }
  );

  it("should include allowed targets in error message for invalid transition", () => {
    const result = validateTransition(TASK_TRANSITIONS, "not-started", "complete");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("in-progress");
      expect(result.reason).toContain("blocked");
    }
  });
});

// Similar exhaustive tests for UserStoryStatus and ProjectStatus transitions...
```

#### 2. Cascading Re-evaluation Tests

```typescript
// packages/domain/src/tests/status/cascading-reevaluation.test.ts
// Tests for cascading status changes when tasks complete.
import { describe, it, expect } from "vitest";
import { computeCascadingChanges, buildReverseDeps } from "@/status/cascading-reevaluation";

describe("Cascading Status Re-evaluation", () => {
  it("should unblock a dependent task when its only dependency completes", () => {
    // Task B depends on Task A. A completes.
    // Assert: command to transition B from blocked -> not-started
  });

  it("should NOT unblock a task when only one of multiple dependencies completes", () => {
    // Task C depends on Task A and Task B. A completes, B is still incomplete.
    // Assert: no command for C (still blocked)
  });

  it("should unblock a task when its LAST remaining dependency completes", () => {
    // Task C depends on A and B. B was already complete. A now completes.
    // Assert: command to transition C from blocked -> not-started
  });

  it("should unblock multiple tasks that depend on the same completed task", () => {
    // Tasks B and C both depend on A. A completes.
    // Assert: commands for both B and C
  });

  it("should not emit commands for tasks that are not blocked", () => {
    // Task B depends on A but is not-started (not blocked). A completes.
    // Assert: no command for B (already in correct state)
  });

  it("should not emit commands for in-progress dependents", () => {
    // Task B depends on A and is in-progress. A completes.
    // Assert: no command for B (in-progress is immune)
  });

  it("should handle tasks with no dependents", () => {
    // Leaf task with no dependents completes.
    // Assert: empty commands array
  });

  it("should handle long dependency chains", () => {
    // A -> B -> C -> D (chain). A completes.
    // Assert: only B is unblocked (not C or D, since B hasn't completed yet)
  });
});
```

#### 3. Task Status Determination Tests

```typescript
// packages/domain/src/tests/status/task-status-determination.test.ts
import { describe, it, expect } from "vitest";
import { determineTaskStatus, determineInitialTaskStatus } from "@/status/task-status-determination";

describe("Task Status Determination", () => {
  it("should determine not-started for task with no dependencies", () => {});
  it("should determine not-started for task with all deps complete", () => {});
  it("should determine blocked for task with incomplete deps", () => {});
  it("should not change in-progress tasks", () => {});
  it("should not change complete tasks", () => {});
  it("should return shouldChange: false when status already correct", () => {});
});
```

#### 4. Story Status Derivation Tests

```typescript
// packages/domain/src/tests/status/story-status-derivation.test.ts
import { describe, it, expect } from "vitest";
import { deriveStoryStatus, findCrossStoryDependencies } from "@/status/story-status-derivation";

describe("Story Status Derivation", () => {
  it("should derive complete when all tasks are complete", () => {});
  it("should derive blocked when cross-story dep is incomplete", () => {});
  it("should derive in-progress when a task is in-progress", () => {});
  it("should derive not-started when all cross-story deps satisfied", () => {});
  it("should preserve draft status", () => {});
  it("should preserve failed status", () => {});
  it("should handle story with no tasks", () => {});
  it("should not consider intra-story deps as cross-story", () => {});
  it("should list all blocking dependencies in the result", () => {});
});
```

#### 5. Epic Status Derivation Tests

```typescript
// packages/domain/src/tests/status/epic-status-derivation.test.ts
import { describe, it, expect } from "vitest";
import { deriveEpicStatus } from "@/status/epic-status-derivation";

describe("Epic Status Derivation", () => {
  it("should derive complete when all stories are complete", () => {});
  it("should derive failed when any story failed and none in-progress", () => {});
  it("should derive in-progress when any story is in-progress", () => {});
  it("should derive in-progress even when some stories are failed", () => {});
  it("should derive blocked when all non-complete stories are blocked", () => {});
  it("should derive not-started for empty epics", () => {});
  it("should derive not-started when all stories are draft", () => {});
  it("should include accurate story summary counts", () => {});
});

describe("Edge Cases", () => {
  it("should handle single-task stories", () => {});
  it("should handle long chains of dependent stories", () => {});
  it("should handle diamond dependency patterns", () => {});
  it("should handle mixed draft and non-draft stories", () => {});
});
```

## Acceptance Criteria

- [ ] All valid task transitions are tested and accepted
- [ ] All invalid task transitions are tested and rejected (exhaustive matrix)
- [ ] All valid user story transitions are tested and accepted
- [ ] All invalid user story transitions are tested and rejected
- [ ] All valid project transitions are tested and accepted
- [ ] All invalid project transitions are tested and rejected
- [ ] Cascading re-evaluation tests cover: single dep, multiple deps, last dep, multiple dependents, long chains, no dependents
- [ ] Task status determination tests cover: no deps, all deps complete, partial deps, in-progress immunity, complete immunity
- [ ] Story status derivation tests cover: all-complete, blocked by cross-story dep, in-progress, not-started, draft preserved, failed preserved, no tasks, intra-story deps excluded
- [ ] Epic status derivation tests cover: all-complete, any-failed, any-in-progress, all-blocked, empty, all-draft, in-progress-supersedes-failed
- [ ] Edge case tests cover: single-task stories, long chains, diamond patterns, mixed states
- [ ] Error messages in rejection results are descriptive and actionable
- [ ] No `any` types used in test code
- [ ] All tests pass in CI
- [ ] Test coverage for the status engine exceeds 95% line coverage

## Technical Notes

- Use `it.each()` (Vitest's parameterized test feature) for exhaustive transition matrix testing. This makes it easy to test all valid/invalid combinations without writing repetitive test code.
- For cascading re-evaluation tests, build small focused DAGs for each scenario rather than reusing a large complex graph. This makes each test self-documenting.
- Consider adding snapshot tests for complex cascading scenarios (save the full list of commands produced by a cascade and compare against a snapshot).
- The "long chain" test is important: A -> B -> C -> D, completing A should only unblock B, not C or D. This verifies the cascade doesn't over-propagate at the task level.
- The "diamond pattern" test: A -> C, B -> C, with both A and B as deps of C. Completing A alone should not unblock C; only completing both A and B should unblock C.
- Consider adding property-based tests for the status engine (using fast-check) to complement the example-based tests, particularly for cascading re-evaluation.

## References

- **Functional Requirements:** FR-STATUS-040 (status engine test coverage), FR-TEST-002 (safety-critical testing)
- **Design Specification:** Section 5.2.10 (Status Engine Testing), Section 8.1 (Test Infrastructure)
- **Project Setup:** Vitest configuration, test organization

## Estimated Complexity

Large — This is the most extensive test suite in the domain logic engine. It must cover all transition paths for three entity types, cascading propagation correctness, multiple derivation scenarios, and numerous edge cases. The exhaustive approach (testing every valid and invalid transition) results in a high test count. However, each individual test is simple — the complexity is in the breadth of coverage.
