# Test Failure Recovery Flow

## Task Details

- **Title:** Test Failure Recovery Flow
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Work Execution & Status Progression E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the failure recovery flow. Assign a story to a worker, simulate the worker marking the story as failed with an error message, verify the Failed badge and error message display, then have a human user review the failure, edit a task, click Reset, verify the story returns to not-started/blocked, and verify a worker can pick it up again.

### Test: Failure Recovery Flow

```typescript
// apps/web/e2e/work-execution/failure-recovery.spec.ts
// E2E tests for the failure recovery flow.
// Covers: worker fails story → error displayed → human reviews →
// edits task → resets story → worker picks up again.
import { test, expect } from "../fixtures";
import { StoryDetailPage, TaskDetailPage } from "../page-objects";
import { triggerQueryRefetch } from "../utils";

test.describe("Failure Recovery Flow", () => {
  test("worker failure displays error and allows human reset", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story that is in-progress (assigned to a worker).
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("in-progress-story-id");
    await storyDetail.expectStatus("In Progress");
    await storyDetail.expectAssignedWorker("Test Worker");

    // Step 1: Simulate the worker marking the story as failed.
    await page.evaluate(async () => {
      await fetch("/api/v1/stories/in-progress-story-id/fail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          errorMessage: "Build failed: TypeScript compilation error in auth module",
          failedTaskId: "task-2-id",
        }),
      });
    });

    // Step 2: Wait for polling to update the UI.
    await triggerQueryRefetch(page);
    await storyDetail.goto("in-progress-story-id");

    // Verify the Failed badge is displayed.
    await storyDetail.expectStatus("Failed");

    // Verify the error message is displayed on the story detail.
    await storyDetail.expectFailedWithError(
      "Build failed: TypeScript compilation error in auth module"
    );

    // Step 3: Human reviews the failure and edits the problematic task.
    // Navigate to the failed task to make corrections.
    await storyDetail.openTask("Implement API Endpoint");
    const taskDetail = new TaskDetailPage(page);

    // Edit the task description to fix the issue.
    await taskDetail.editButton.click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel(/description/i).clear();
    await modal.getByLabel(/description/i).fill(
      "Implement API endpoint with corrected TypeScript types for auth module"
    );
    await modal.getByRole("button", { name: /save/i }).click();

    // Step 4: Navigate back to the story and click Reset.
    await page.goBack();
    await storyDetail.goto("in-progress-story-id");
    await storyDetail.resetStory();

    // Step 5: Verify the story returns to not-started/blocked status.
    await storyDetail.expectStatus("Not Started");

    // Verify the error message is no longer displayed.
    await expect(storyDetail.failedErrorMessage).not.toBeVisible();

    // Verify the worker assignment is cleared.
    await expect(storyDetail.assignedWorkerBadge).not.toBeVisible();
  });

  test("reset story allows worker to pick it up again", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a failed story that has been reset to not-started.
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("reset-story-id");
    await storyDetail.expectStatus("Not Started");

    // Simulate a worker requesting work again.
    await page.evaluate(async () => {
      await fetch("/api/v1/work/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: "test-worker-id" }),
      });
    });

    await triggerQueryRefetch(page);
    await storyDetail.goto("reset-story-id");

    // Verify the story is assigned again.
    await storyDetail.expectStatus("In Progress");
    await storyDetail.expectAssignedWorker("Test Worker");
  });

  test("failed story shows in attempt history", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story with a previous failed attempt.
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("story-with-failed-attempt-id");

    // Open the Attempt History tab.
    const attemptRows = await storyDetail.getAttemptHistoryRows();

    // Verify at least one attempt is logged.
    await expect(attemptRows.first()).toBeVisible();

    // Verify the failed attempt includes the error message.
    await expect(attemptRows.first()).toContainText("Failed");
    await expect(attemptRows.first()).toContainText(
      "TypeScript compilation error"
    );
  });
});
```

## Acceptance Criteria

- [ ] Test verifies a worker can fail a story with an error message via API
- [ ] Test verifies the story status transitions to "Failed" after worker failure
- [ ] Test verifies the error message is displayed on the story detail page
- [ ] Test verifies a human can edit the failed task's description
- [ ] Test verifies clicking "Reset" returns the story to "Not Started" status
- [ ] Test verifies the error message is cleared after reset
- [ ] Test verifies the worker assignment is cleared after reset
- [ ] Test verifies a worker can pick up the reset story for a new attempt
- [ ] Test verifies the failed attempt is logged in the Attempt History tab
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- The failure API call (`POST /api/v1/stories/:id/fail`) includes an `errorMessage` string and optionally a `failedTaskId` to identify which task caused the failure. The MSW handler updates the story status and stores the error.
- The Reset button is only visible when the story is in "Failed" status. The MSW handler for reset clears the error, resets the status, and clears the worker assignment.
- The Attempt History tab shows all previous attempts for the story, including the worker name, start time, end time, and outcome (completed, failed, timed out).
- Task editing during failure review demonstrates that Failed stories allow modifications (unlike In Progress stories which are read-only).

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — Failure recovery: fail story → review → reset)
- **Project Setup Specification:** Section G.5 (Correctness-Focused Requirements — status transitions)
- **Functional Requirements:** FR-WORK-004 (worker failure reporting), FR-WORK-005 (human review and reset)
- **Design Specification:** Failed story UI, error message display, Attempt History tab

## Estimated Complexity

Large — The failure recovery flow involves multiple state transitions (in-progress → failed → editing → reset → not-started → re-assigned), API simulations, and UI interactions across story and task detail pages. The test must verify the complete recovery loop including re-assignment.
