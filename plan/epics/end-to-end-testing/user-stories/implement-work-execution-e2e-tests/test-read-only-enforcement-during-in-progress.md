# Test Read-Only Enforcement During In-Progress

## Task Details

- **Title:** Test Read-Only Enforcement During In-Progress
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Work Execution & Status Progression E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the read-only enforcement when a story is in-progress (assigned to a worker). Navigate to the story detail, verify all fields display lock icons, verify edit and delete buttons are disabled, verify a "read-only" banner is visible, and verify that direct API modification attempts are rejected with an appropriate error.

### Test: Read-Only Enforcement

```typescript
// apps/web/e2e/work-execution/read-only-enforcement.spec.ts
// E2E tests for read-only enforcement during in-progress states.
// Verifies that the UI prevents modifications to stories and tasks
// that are currently being worked on by an agent.
import { test, expect } from "../fixtures";
import {
  StoryDetailPage,
  TaskDetailPage,
} from "../page-objects";
import { expectButtonDisabledWithTooltip } from "../utils";

test.describe("Read-Only Enforcement During In-Progress", () => {
  test("in-progress story shows read-only banner", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed an in-progress story (assigned to a worker).
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("in-progress-story-id");

    // Verify the read-only banner is visible.
    await storyDetail.expectReadOnly();
    await expect(storyDetail.readOnlyBanner).toContainText(/read-only/i);
    await expect(storyDetail.readOnlyBanner).toContainText(/in progress/i);
  });

  test("edit and delete buttons are disabled on in-progress story", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("in-progress-story-id");

    // Verify the delete button is disabled.
    await expect(storyDetail.deleteButton).toBeDisabled();

    // Verify hovering the disabled delete button shows a tooltip.
    await expectButtonDisabledWithTooltip(
      page,
      /delete/i,
      /cannot delete.*in progress/i
    );
  });

  test("tasks under in-progress story show lock icons", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("in-progress-story-id");

    // Navigate to a task under the in-progress story.
    await storyDetail.openTask("Setup Database Schema");

    const taskDetail = new TaskDetailPage(page);

    // Verify lock icons are displayed on the task fields.
    await taskDetail.expectReadOnly();

    // Verify the edit button is disabled.
    await expect(taskDetail.editButton).toBeDisabled();

    // Verify the delete button is disabled.
    await expect(taskDetail.deleteButton).toBeDisabled();
  });

  test("create task button is disabled on in-progress story", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("in-progress-story-id");
    await storyDetail.tasksTab.click();

    // The "Create Task" button should be disabled because the story
    // is in-progress and its structure cannot be modified.
    await expect(storyDetail.createTaskButton).toBeDisabled();
  });

  test("API modification attempt is rejected during in-progress", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    // Attempt to modify the in-progress story directly via API.
    // This simulates someone bypassing the UI restrictions.
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/v1/stories/in-progress-story-id", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Modified Title" }),
      });
      return { status: res.status, body: await res.json() };
    });

    // Verify the API rejects the modification with a 409 Conflict
    // or 403 Forbidden status.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body.error).toMatch(/in.progress|read.only|locked/i);
  });

  test("API delete attempt is rejected during in-progress", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    // Attempt to delete an in-progress story via API.
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/v1/stories/in-progress-story-id", {
        method: "DELETE",
      });
      return { status: res.status, body: await res.json() };
    });

    // Verify the API rejects the deletion.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body.error).toMatch(/in.progress|cannot delete|locked/i);
  });

  test("dependency modification blocked on tasks under in-progress story", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("in-progress-story-id");
    await storyDetail.openTask("Implement API Endpoint");

    const taskDetail = new TaskDetailPage(page);

    // Verify the "Add Dependency" button is disabled.
    await expect(taskDetail.addDependencyButton).toBeDisabled();
  });
});
```

## Acceptance Criteria

- [ ] Test verifies in-progress stories display a "read-only" banner explaining the restriction
- [ ] Test verifies the delete button is disabled on in-progress stories with an explanatory tooltip
- [ ] Test verifies tasks under an in-progress story display lock icons
- [ ] Test verifies edit and delete buttons are disabled on tasks under in-progress stories
- [ ] Test verifies the "Create Task" button is disabled on in-progress stories
- [ ] Test verifies the "Add Dependency" button is disabled on tasks under in-progress stories
- [ ] Test verifies direct API PATCH (modification) is rejected with an error status (400+) during in-progress
- [ ] Test verifies direct API DELETE is rejected with an error status (400+) during in-progress
- [ ] Test verifies API error responses include a descriptive error message referencing the in-progress state
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- Read-only enforcement applies to the entire story and its child tasks when the story is in "In Progress" status. This prevents structural changes while a worker is executing the plan.
- The read-only banner (`data-testid="read-only-banner"`) is distinct from the timeout banner and failure error message. It should have clear messaging like "This story is read-only while in progress."
- Lock icons (`data-testid="lock-icon"`) appear next to each editable field on the task detail page when the parent story is in-progress.
- API-level enforcement is the second line of defense. Even if the UI restrictions are bypassed (e.g., via browser dev tools), the API should reject modifications with a 409 Conflict or 403 Forbidden response.
- The `page.evaluate(async () => fetch(...))` pattern is used to make direct API calls from the browser context, testing the server-side enforcement independently of UI constraints.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — read-only enforcement during in-progress states)
- **Project Setup Specification:** Section G.5 (Correctness-Focused Requirements — read-only enforcement during in-progress states)
- **Functional Requirements:** FR-WORK-009 (read-only enforcement), FR-WORK-010 (API-level modification rejection)
- **Design Specification:** Read-only banner, lock icon pattern, disabled button states

## Estimated Complexity

Medium — The read-only enforcement tests are relatively straightforward (checking disabled states and API rejections), but they cover multiple UI elements (banner, buttons, lock icons, tooltips) across both story and task detail pages, plus API-level verification.
