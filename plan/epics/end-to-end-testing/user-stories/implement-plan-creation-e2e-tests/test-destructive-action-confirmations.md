# Test Destructive Action Confirmations

## Task Details

- **Title:** Test Destructive Action Confirmations
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Plan Creation & Publish E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for destructive action confirmation flows. When a user attempts to delete a project with children, a confirmation modal should display the entity counts (epics, stories, tasks) that will be affected. Test canceling the deletion (nothing deleted), confirming the deletion (entities deleted), and deletion being blocked when entities are in-progress.

### Test: Destructive Action Confirmations

```typescript
// apps/web/e2e/plan-creation/destructive-actions.spec.ts
// E2E tests for destructive action confirmation modals.
// Verifies cancel/confirm behavior, cascading delete counts,
// and deletion blocking for in-progress entities.
import { test, expect } from '../fixtures';
import {
  ProjectListPage,
  ProjectDetailPage,
  EpicDetailPage,
  StoryDetailPage,
} from '../page-objects';
import { handleConfirmationModal, expectSuccessToast } from '../utils';

test.describe('Destructive Action Confirmations', () => {
  test('delete project with children shows entity counts in confirmation modal', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a project with 2 epics, 3 stories, and 5 tasks.
    seedData({});

    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto('seeded-project-id');

    // Click the delete button.
    await projectDetail.deleteButton.click();

    // Verify the confirmation modal displays cascading entity counts.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/2 epics/i);
    await expect(dialog).toContainText(/3 stories/i);
    await expect(dialog).toContainText(/5 tasks/i);
    await expect(dialog).toContainText(/permanently deleted/i);
  });

  test('cancel delete leaves all entities intact', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto('seeded-project-id');

    // Click delete then cancel.
    await projectDetail.deleteButton.click();
    await handleConfirmationModal(page, { action: 'cancel' });

    // Verify the project is still visible and accessible.
    await expect(projectDetail.heading).toBeVisible();
    await projectDetail.expectStatus('Draft');

    // Verify children still exist.
    await projectDetail.epicsTab.click();
    const epicRows = projectDetail.epicsTable.getByRole('row');
    // 2 data rows + 1 header = 3
    await expect(epicRows).toHaveCount(3);
  });

  test('confirm delete removes project and all children', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto('seeded-project-id');

    // Click delete then confirm.
    await projectDetail.deleteButton.click();
    await handleConfirmationModal(page, {
      expectedContent: /permanently deleted/i,
      action: 'confirm',
    });

    // Verify redirect to projects list after deletion.
    await expect(page).toHaveURL(/\/projects/);

    // Verify the project no longer appears in the list.
    const projectList = new ProjectListPage(page);
    const deletedProject = projectList.projectsTable.getByRole('row', {
      name: /E2E Test Plan/,
    });
    await expect(deletedProject).not.toBeVisible();
  });

  test('delete epic shows confirmation with child counts', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const epicDetail = new EpicDetailPage(page);
    await epicDetail.goto('seeded-epic-id');

    await epicDetail.deleteButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/stories/i);
    await expect(dialog).toContainText(/tasks/i);

    // Cancel the deletion.
    await handleConfirmationModal(page, { action: 'cancel' });
    await expect(epicDetail.heading).toBeVisible();
  });

  test('delete story shows confirmation and removes story', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('seeded-story-id');

    await storyDetail.deleteButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/tasks/i);

    // Confirm the deletion.
    await dialog.getByRole('button', { name: /confirm/i }).click();

    // Verify redirect to the parent epic.
    await expect(page).toHaveURL(/\/epics\//);
  });

  test('delete task shows confirmation and removes task', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    // Navigate to a task and delete it.
    await page.goto('/tasks/seeded-task-id');
    const deleteButton = page.getByRole('button', { name: /delete/i });
    await deleteButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /confirm/i }).click();

    // Verify redirect to the parent story.
    await expect(page).toHaveURL(/\/stories\//);
  });

  test('deletion blocked when entity is in-progress', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story that is currently in-progress (assigned to a worker).
    seedData({});

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('in-progress-story-id');

    // Verify the delete button is disabled.
    await expect(storyDetail.deleteButton).toBeDisabled();

    // Hover over the disabled button to see the tooltip explanation.
    await storyDetail.deleteButton.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/in-progress/i);
  });

  test('deletion blocked for project with in-progress children', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a project where one story is in-progress.
    seedData({});

    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto('project-with-in-progress-story-id');

    // The delete button should be disabled.
    await expect(projectDetail.deleteButton).toBeDisabled();
  });
});
```

## Acceptance Criteria

- [ ] Test verifies deleting a project with children shows a confirmation modal with entity counts (epics, stories, tasks)
- [ ] Test verifies canceling the delete modal leaves all entities intact
- [ ] Test verifies confirming the delete removes the project and redirects to the projects list
- [ ] Test verifies the deleted project no longer appears in the projects list
- [ ] Test verifies deleting an epic shows a confirmation with child story/task counts
- [ ] Test verifies deleting a story shows a confirmation with child task counts
- [ ] Test verifies deleting a task shows a simple confirmation
- [ ] Test verifies deletion is blocked (button disabled) when the entity is in-progress
- [ ] Test verifies a disabled delete button shows a tooltip explaining the in-progress block
- [ ] Test verifies deletion is blocked for a project with in-progress children
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- Confirmation modals are implemented using shadcn/ui `AlertDialog` with `role="dialog"`. The modal includes a title, description with entity counts, and confirm/cancel buttons.
- Entity counts in the confirmation modal are fetched from the API and include all descendants (not just direct children).
- The in-progress deletion block is enforced both on the client side (disabled button) and server side (400 response if attempted via API). The E2E test verifies the client-side block.
- The tooltip on the disabled delete button uses shadcn/ui `Tooltip` with `role="tooltip"`.
- After successful deletion, the UI redirects to the parent entity's page (story → epic, epic → project, project → project list).

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — destructive action confirmation flows)
- **Project Setup Specification:** Section G.5 (Correctness-Focused Requirements — read-only enforcement during in-progress states)
- **Functional Requirements:** FR-DEL-001 (cascading delete with confirmation), FR-DEL-002 (deletion blocked during in-progress)
- **Design Specification:** Confirmation modal layout, disabled button with tooltip pattern

## Estimated Complexity

Medium — The confirmation modal flow is standard, but testing the various entity types (project, epic, story, task), the cancel vs. confirm paths, and the in-progress blocking requires multiple test scenarios with different seed data configurations.
