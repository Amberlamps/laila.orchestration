# Test Work Assignment and Status Progression

## Task Details

- **Title:** Test Work Assignment and Status Progression
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Work Execution & Status Progression E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the complete work assignment and status progression lifecycle. Create and publish a project with a full plan, simulate a worker API call to request work, verify the story is assigned (UI shows in-progress after polling refresh), simulate task completions triggering cascading unblocks, verify all tasks complete leading to story auto-completion, and verify the project completes. Also verify dashboard widgets update to reflect the current state.

### Test: Work Assignment and Status Progression

```typescript
// apps/web/e2e/work-execution/assignment-and-progression.spec.ts
// E2E tests for work assignment and cascading status progression.
// Simulates the full lifecycle: publish → worker requests work →
// task completions → story completes → project completes.
import { test, expect } from "../fixtures";
import {
  DashboardPage,
  ProjectDetailPage,
  StoryDetailPage,
} from "../page-objects";
import {
  waitForPollingRefresh,
  triggerQueryRefetch,
  expectStatusBadge,
} from "../utils";

test.describe("Work Assignment and Status Progression", () => {
  test("full work lifecycle: assign → task completions → story completes → project completes", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a published project with a ready plan:
    // Project (Ready) → Epic (Ready) → Story (Not Started)
    // Story has 3 tasks: Task1 (not-started), Task2 (blocked by Task1),
    // Task3 (blocked by Task2).
    seedData({});

    // Step 1: Verify the story is in Not Started status.
    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("seeded-story-id");
    await storyDetail.expectStatus("Not Started");

    // Step 2: Simulate a worker requesting work via the API.
    // This is done by triggering the MSW work-request handler
    // which assigns the first available story to a worker.
    await page.evaluate(async () => {
      // Simulate the worker's POST /api/v1/work/request call.
      // In a real scenario, this would come from an external agent.
      await fetch("/api/v1/work/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: "test-worker-id" }),
      });
    });

    // Step 3: Wait for TanStack Query polling to pick up the change.
    // The story status should transition from Not Started to In Progress.
    await triggerQueryRefetch(page);
    await storyDetail.goto("seeded-story-id");
    await storyDetail.expectStatus("In Progress");
    await storyDetail.expectAssignedWorker("Test Worker");

    // Step 4: Simulate task completions in sequence.
    // Complete Task 1 → unblocks Task 2.
    await page.evaluate(async () => {
      await fetch("/api/v1/tasks/task-1-id/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    });

    await triggerQueryRefetch(page);

    // Verify Task 1 is completed and Task 2 is now unblocked (not-started).
    await storyDetail.tasksTab.click();
    const task1Row = storyDetail.tasksTable.getByRole("row", {
      name: /Setup Database Schema/,
    });
    await expect(task1Row).toContainText("Completed");

    const task2Row = storyDetail.tasksTable.getByRole("row", {
      name: /Implement API Endpoint/,
    });
    await expect(task2Row).toContainText("Not Started");

    // Complete Task 2 → unblocks Task 3.
    await page.evaluate(async () => {
      await fetch("/api/v1/tasks/task-2-id/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    });

    await triggerQueryRefetch(page);

    // Complete Task 3 → all tasks done → story auto-completes.
    await page.evaluate(async () => {
      await fetch("/api/v1/tasks/task-3-id/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    });

    await triggerQueryRefetch(page);
    await storyDetail.goto("seeded-story-id");

    // Step 5: Verify story auto-completed.
    await storyDetail.expectStatus("Completed");

    // Step 6: Verify project and epic also completed.
    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto("seeded-project-id");
    await projectDetail.expectStatus("Completed");
  });

  test("dashboard widgets update during work progression", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a project with a story in-progress.
    seedData({});

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Verify the in-progress stories widget shows the correct count.
    await dashboard.expectWidgetValue("in-progress-stories", "1");
    await dashboard.expectWidgetValue("active-projects", "1");

    // Simulate story completion via API.
    await page.evaluate(async () => {
      await fetch("/api/v1/stories/seeded-story-id/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    });

    await triggerQueryRefetch(page);

    // Verify widgets update to reflect the completion.
    await dashboard.expectWidgetValue("in-progress-stories", "0");
  });

  test("cascading unblock updates blocked tasks to not-started", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed tasks with dependency chain: A → B → C.
    // B and C are blocked. Completing A should unblock B (but not C).
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("seeded-story-id");
    await storyDetail.tasksTab.click();

    // Verify initial states.
    const taskA = storyDetail.tasksTable.getByRole("row", { name: /Task A/ });
    const taskB = storyDetail.tasksTable.getByRole("row", { name: /Task B/ });
    const taskC = storyDetail.tasksTable.getByRole("row", { name: /Task C/ });
    await expect(taskA).toContainText("Not Started");
    await expect(taskB).toContainText("Blocked");
    await expect(taskC).toContainText("Blocked");

    // Complete Task A.
    await page.evaluate(async () => {
      await fetch("/api/v1/tasks/task-a-id/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    });

    await triggerQueryRefetch(page);
    await storyDetail.goto("seeded-story-id");
    await storyDetail.tasksTab.click();

    // Task A completed, Task B unblocked, Task C still blocked (depends on B).
    await expect(
      storyDetail.tasksTable.getByRole("row", { name: /Task A/ })
    ).toContainText("Completed");
    await expect(
      storyDetail.tasksTable.getByRole("row", { name: /Task B/ })
    ).toContainText("Not Started");
    await expect(
      storyDetail.tasksTable.getByRole("row", { name: /Task C/ })
    ).toContainText("Blocked");
  });
});
```

## Acceptance Criteria

- [ ] Test verifies a published project's story starts in "Not Started" status
- [ ] Test verifies simulating a worker work-request assigns the story and transitions it to "In Progress"
- [ ] Test verifies the assigned worker name appears on the story detail page
- [ ] Test verifies completing Task 1 unblocks Task 2 (cascading status transition)
- [ ] Test verifies completing all tasks auto-completes the story
- [ ] Test verifies the project transitions to "Completed" when all stories complete
- [ ] Test verifies dashboard widgets update during work progression (in-progress count changes)
- [ ] Test verifies cascading unblock only affects directly dependent tasks (not transitive)
- [ ] Test verifies TanStack Query polling or triggered refetch updates the UI after server-side mutations
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- Worker API calls are simulated using `page.evaluate(() => fetch(...))` to trigger the MSW handlers from the browser context. This ensures the requests go through the same MSW interception as the app's own requests.
- The `triggerQueryRefetch` utility forces a TanStack Query refetch by dispatching a window focus event, avoiding the 15-second polling wait.
- Cascading unblock logic is handled by the MSW handler: when a task is completed, the handler checks if any blocked tasks have all dependencies completed and transitions them to "not-started".
- Dashboard widget values are verified using `getByTestId("widget-value")` within each widget container. The widget value updates via TanStack Query polling/refetch.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — Work assignment and status progression)
- **Project Setup Specification:** Section G.5 (Correctness-Focused Requirements — work assignment eligibility, blocked/not-started recalculation cascades)
- **Functional Requirements:** FR-WORK-001 (work request), FR-WORK-002 (task completion with cascading unblock), FR-WORK-003 (story auto-complete), FR-DASH-002 (dashboard widget updates)
- **Design Specification:** Story detail page, task status badges, dashboard widgets

## Estimated Complexity

Large — This is the most complex E2E test in the suite. It simulates the full work execution lifecycle with multiple API calls, cascading state transitions, polling refreshes, and cross-page verification. The MSW handlers must correctly implement the orchestration logic (assignment, unblocking, auto-completion).
