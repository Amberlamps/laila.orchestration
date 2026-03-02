# Test Dependency Cycle Detection UI

## Task Details

- **Title:** Test Dependency Cycle Detection UI
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Plan Creation & Publish E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** Test Full Plan Creation Flow

## Description

Implement E2E tests for the dependency cycle detection UI. When a user attempts to add a circular dependency between tasks, the UI should display an inline error message showing the cycle path and prevent the dependency from being saved. This tests the DAG validation logic as exposed through the UI.

### Test: Dependency Cycle Detection

```typescript
// apps/web/e2e/plan-creation/cycle-detection.spec.ts
// E2E tests for dependency cycle detection.
// Verifies that the UI prevents circular dependencies and shows
// the cycle path in an inline error message.
import { test, expect } from "../fixtures";
import {
  StoryDetailPage,
  TaskDetailPage,
} from "../page-objects";

test.describe("Dependency Cycle Detection", () => {
  test("adding circular dependency shows inline error with cycle path", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed three tasks with a linear dependency chain:
    // Task A → Task B → Task C
    // Then attempt to add Task C → Task A (creating a cycle).
    seedData({
      // Pre-seed: story with 3 tasks, Task B depends on Task A,
      // Task C depends on Task B.
    });

    // Navigate to Task C's detail page.
    const taskDetail = new TaskDetailPage(page);
    await taskDetail.goto("task-c-id");

    // Verify existing dependency (Task C → Task B).
    await taskDetail.expectDependency("Task B - Implement API Endpoint");

    // Attempt to add a dependency on Task A, which would create a cycle:
    // Task A → Task B → Task C → Task A
    await taskDetail.addDependency("Task A - Setup Database Schema");

    // Verify the cycle error is displayed inline.
    await taskDetail.expectCycleError();

    // Verify the error message shows the cycle path.
    const cycleError = page.getByTestId("cycle-error");
    await expect(cycleError).toContainText("Task A");
    await expect(cycleError).toContainText("Task B");
    await expect(cycleError).toContainText("Task C");
  });

  test("circular dependency is not persisted after error", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Same setup: Task A → Task B → Task C.
    seedData({});

    const taskDetail = new TaskDetailPage(page);
    await taskDetail.goto("task-c-id");

    // Attempt cycle: Task C → Task A.
    await taskDetail.addDependency("Task A - Setup Database Schema");
    await taskDetail.expectCycleError();

    // Reload the page to verify the dependency was not saved.
    await page.reload();
    await taskDetail.goto("task-c-id");

    // Task C should only have Task B as a dependency, not Task A.
    await taskDetail.expectDependency("Task B - Implement API Endpoint");
    const dependencySection = page.getByTestId("dependencies-section");
    await expect(dependencySection).not.toContainText("Task A");
  });

  test("self-dependency is rejected", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Attempt to add a task as a dependency on itself.
    seedData({});

    const taskDetail = new TaskDetailPage(page);
    await taskDetail.goto("task-a-id");

    // Try to add Task A as its own dependency.
    await taskDetail.addDependency("Task A - Setup Database Schema");

    // Verify the error is displayed (self-dependency is a trivial cycle).
    await taskDetail.expectCycleError();
  });

  test("valid dependency is accepted after cycle error is dismissed", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // After a cycle error, adding a valid dependency should work.
    seedData({});

    const taskDetail = new TaskDetailPage(page);
    await taskDetail.goto("task-c-id");

    // First, trigger a cycle error.
    await taskDetail.addDependency("Task A - Setup Database Schema");
    await taskDetail.expectCycleError();

    // Dismiss the error (click away or close).
    await page.keyboard.press("Escape");

    // Now add a valid dependency (e.g., on a new unrelated Task D).
    // This verifies the UI recovers from the error state.
    await taskDetail.addDependency("Task D - Deploy to Staging");
    await taskDetail.expectDependency("Task D - Deploy to Staging");

    // Verify no cycle error this time.
    const cycleError = page.getByTestId("cycle-error");
    await expect(cycleError).not.toBeVisible();
  });
});
```

## Acceptance Criteria

- [ ] Test verifies adding a circular dependency (A → B → C → A) displays an inline cycle error
- [ ] Test verifies the cycle error message includes the full cycle path (all task names in the cycle)
- [ ] Test verifies the circular dependency is not persisted (page reload shows original dependencies only)
- [ ] Test verifies self-dependency (A → A) is rejected with a cycle error
- [ ] Test verifies the UI recovers from a cycle error and accepts valid dependencies afterward
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- Cycle detection is performed server-side by the API and surfaced as a 400/422 response. The MSW handler must implement basic cycle detection logic (or return a mocked error response when the specific cycle-causing dependency is detected).
- The cycle error message is displayed inline (not as a toast) near the dependency input, identified by `data-testid="cycle-error"`.
- The cycle path should list task names in the order they form the cycle, helping the user understand why the dependency was rejected.
- After dismissing the error (Escape key or clicking elsewhere), the dependency form should reset to its clean state, ready for a new valid input.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — dependency cycle detection)
- **Project Setup Specification:** Section G.5 (Correctness-Focused Requirements — blocked/not-started recalculation cascades)
- **Functional Requirements:** FR-DEP-002 (DAG cycle detection), FR-DEP-003 (cycle error display with path)
- **Design Specification:** Dependency management UI, inline error display pattern

## Estimated Complexity

Medium — The cycle detection logic itself is in the API layer, but testing it E2E requires carefully seeded dependency chains, precise user interactions to trigger the cycle, and verification that the error message includes the full cycle path. MSW handler must support cycle detection responses.
