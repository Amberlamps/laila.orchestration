# Test Manual Worker Unassignment

## Task Details

- **Title:** Test Manual Worker Unassignment
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Work Execution & Status Progression E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the manual worker unassignment flow. Navigate to a story that is assigned to a worker (in-progress), click "Unassign Worker", confirm the action in the confirmation dialog, verify the story resets to not-started, verify the previous attempt is logged, and verify the worker is freed and can pick up new work.

### Test: Manual Worker Unassignment

```typescript
// apps/web/e2e/work-execution/manual-unassignment.spec.ts
// E2E tests for manual worker unassignment.
// Verifies the human-initiated unassignment flow, including
// confirmation dialog, status reset, and attempt logging.
import { test, expect } from "../fixtures";
import { StoryDetailPage } from "../page-objects";
import { handleConfirmationModal, triggerQueryRefetch } from "../utils";

test.describe("Manual Worker Unassignment", () => {
  test("unassign worker resets story and logs attempt", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed an in-progress story assigned to a worker.
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("in-progress-story-id");

    // Verify the story is in-progress with an assigned worker.
    await storyDetail.expectStatus("In Progress");
    await storyDetail.expectAssignedWorker("Test Worker");

    // Click "Unassign Worker" button.
    await storyDetail.unassignWorkerButton.click();

    // Verify the confirmation dialog appears.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/unassign/i);
    await expect(dialog).toContainText(/Test Worker/i);

    // Confirm the unassignment.
    await dialog.getByRole("button", { name: /confirm/i }).click();

    // Verify the success toast.
    await storyDetail.expectSuccessToast("unassigned");

    // Verify the story status resets to Not Started.
    await storyDetail.expectStatus("Not Started");

    // Verify the worker assignment badge is cleared.
    await expect(storyDetail.assignedWorkerBadge).not.toBeVisible();
  });

  test("cancel unassignment keeps story in-progress", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("in-progress-story-id");
    await storyDetail.expectStatus("In Progress");

    // Click unassign then cancel.
    await storyDetail.unassignWorkerButton.click();
    await handleConfirmationModal(page, { action: "cancel" });

    // Verify the story remains in-progress.
    await storyDetail.expectStatus("In Progress");
    await storyDetail.expectAssignedWorker("Test Worker");
  });

  test("unassigned attempt appears in Attempt History", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story that was manually unassigned (now not-started,
    // with a previous "Unassigned" attempt in history).
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("manually-unassigned-story-id");

    // Open the Attempt History tab.
    const attemptRows = await storyDetail.getAttemptHistoryRows();

    // Verify the unassigned attempt is logged.
    await expect(attemptRows.first()).toBeVisible();
    await expect(attemptRows.first()).toContainText("Unassigned");
    await expect(attemptRows.first()).toContainText("Test Worker");
  });

  test("freed worker can pick up new work after unassignment", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed two stories: one in-progress (to be unassigned) and
    // one not-started (available for assignment).
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("in-progress-story-id");

    // Unassign the worker from the first story.
    await storyDetail.unassignWorker();

    // Simulate the freed worker requesting new work.
    await page.evaluate(async () => {
      await fetch("/api/v1/work/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: "test-worker-id" }),
      });
    });

    await triggerQueryRefetch(page);

    // Navigate to the second story and verify it was assigned.
    await storyDetail.goto("available-story-id");
    await storyDetail.expectStatus("In Progress");
    await storyDetail.expectAssignedWorker("Test Worker");
  });
});
```

## Acceptance Criteria

- [ ] Test verifies clicking "Unassign Worker" shows a confirmation dialog with worker name
- [ ] Test verifies confirming unassignment resets the story to "Not Started" status
- [ ] Test verifies the worker assignment badge is cleared after unassignment
- [ ] Test verifies a success toast appears after successful unassignment
- [ ] Test verifies canceling the unassignment dialog keeps the story in "In Progress"
- [ ] Test verifies the manual unassignment is logged in Attempt History with "Unassigned" outcome
- [ ] Test verifies the freed worker can pick up a new story after unassignment
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- The "Unassign Worker" button is only visible when the story is in "In Progress" status. The POM's `unassignWorkerButton` locator targets this button.
- The confirmation dialog includes the worker's name to help the user confirm they are unassigning the correct worker.
- Manual unassignment creates an Attempt History entry with outcome "Unassigned" (distinct from "Failed" or "Timed Out") to maintain a clear audit trail.
- After unassignment, the worker's active assignment count decreases, making them eligible for new work via the `POST /api/v1/work/request` endpoint.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — work assignment and status progression)
- **Functional Requirements:** FR-WORK-008 (manual worker unassignment), FR-WORK-007 (attempt history logging)
- **Design Specification:** Story detail page unassign button, confirmation dialog, Attempt History tab

## Estimated Complexity

Medium — The unassignment flow involves a confirmation dialog, status reset, and attempt logging. Testing the freed worker picking up new work adds an additional verification step.
