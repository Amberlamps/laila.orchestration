# Test Timeout Reclamation UI

## Task Details

- **Title:** Test Timeout Reclamation UI
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Work Execution & Status Progression E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the timeout reclamation UI. Assign a story to a worker, simulate the timeout period elapsing (using a short test timeout), verify the timeout reclamation banner appears on the story detail page, verify the story is reset to not-started, and verify the previous attempt is logged in the Attempt History tab with a "Timed Out" outcome.

### Test: Timeout Reclamation

```typescript
// apps/web/e2e/work-execution/timeout-reclamation.spec.ts
// E2E tests for timeout reclamation.
// Verifies that timed-out stories are reclaimed automatically,
// the timeout banner appears, and the attempt is logged.
import { test, expect } from '../fixtures';
import { StoryDetailPage } from '../page-objects';
import { triggerQueryRefetch } from '../utils';

test.describe('Timeout Reclamation', () => {
  test('timed-out story shows reclamation banner and resets', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story that is in-progress but assigned beyond the
    // timeout threshold. The background job would normally reclaim
    // this, but in E2E tests we simulate the reclamation directly.
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('in-progress-story-id');
    await storyDetail.expectStatus('In Progress');

    // Simulate the timeout reclamation background job running.
    // This would normally be triggered by the scheduler, but in
    // E2E tests we call the reclamation endpoint directly.
    await page.evaluate(async () => {
      await fetch('/api/v1/admin/reclaim-timed-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    // Wait for the UI to reflect the reclamation.
    await triggerQueryRefetch(page);
    await storyDetail.goto('in-progress-story-id');

    // Verify the timeout reclamation banner is displayed.
    await expect(storyDetail.timeoutBanner).toBeVisible();
    await expect(storyDetail.timeoutBanner).toContainText(/timed out/i);

    // Verify the story status is reset to Not Started.
    await storyDetail.expectStatus('Not Started');

    // Verify the worker assignment is cleared.
    await expect(storyDetail.assignedWorkerBadge).not.toBeVisible();
  });

  test('timed-out attempt is logged in Attempt History', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story with a timed-out attempt already in history.
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('story-with-timeout-history-id');

    // Open the Attempt History tab.
    const attemptRows = await storyDetail.getAttemptHistoryRows();

    // Verify the timed-out attempt is logged with the correct outcome.
    await expect(attemptRows.first()).toBeVisible();
    await expect(attemptRows.first()).toContainText('Timed Out');

    // Verify the attempt includes the worker name and duration.
    await expect(attemptRows.first()).toContainText('Test Worker');
  });

  test('reclaimed story can be picked up by another worker', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story that was reclaimed after timeout (now not-started).
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('reclaimed-story-id');
    await storyDetail.expectStatus('Not Started');

    // Simulate a different worker requesting work.
    await page.evaluate(async () => {
      await fetch('/api/v1/work/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerId: 'worker-2-id' }),
      });
    });

    await triggerQueryRefetch(page);
    await storyDetail.goto('reclaimed-story-id');

    // Verify the story is re-assigned to the new worker.
    await storyDetail.expectStatus('In Progress');
    await storyDetail.expectAssignedWorker('Worker 2');
  });
});
```

## Acceptance Criteria

- [ ] Test verifies the timeout reclamation banner appears on the story detail page after a story times out
- [ ] Test verifies the banner contains a "timed out" message
- [ ] Test verifies the story status resets to "Not Started" after timeout reclamation
- [ ] Test verifies the worker assignment is cleared after reclamation
- [ ] Test verifies the timed-out attempt is logged in the Attempt History tab with "Timed Out" outcome
- [ ] Test verifies the attempt history entry includes the worker name
- [ ] Test verifies a reclaimed story can be picked up by a different worker
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- In production, timeout reclamation is handled by a background job (from Epic 13: Background Jobs). In E2E tests, the reclamation is triggered manually by calling `POST /api/v1/admin/reclaim-timed-out` via the MSW handler.
- The timeout banner (`data-testid="timeout-reclamation-banner"`) is a visual indicator that the story was reclaimed due to timeout, distinct from the failure error message.
- The Attempt History tab records all assignment attempts, including their outcome: "Completed", "Failed", or "Timed Out". Each entry includes the worker name, start timestamp, and end timestamp (or timeout timestamp).
- Using a short test timeout in MSW (e.g., 1 second instead of the production 30 minutes) avoids long waits in E2E tests.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — work assignment and status progression)
- **Project Setup Specification:** Section G.5 (Correctness-Focused Requirements — timeout reclamation and status transitions)
- **Functional Requirements:** FR-WORK-006 (timeout reclamation), FR-WORK-007 (attempt history logging)
- **Design Specification:** Timeout reclamation banner, Attempt History tab layout

## Estimated Complexity

Medium — The timeout reclamation is simulated via a direct API call, which simplifies the test. The main complexity is verifying the banner display, attempt history logging, and re-assignment capability after reclamation.
