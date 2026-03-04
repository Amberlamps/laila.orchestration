# Test Worker Project Access Management

## Task Details

- **Title:** Test Worker Project Access Management
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Entity Management E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for worker project access management. Create a worker, navigate to its detail page, add project access, verify the project appears in the access table, remove project access, verify the project is removed, and test adding a worker to multiple projects.

### Test: Worker Project Access Management

```typescript
// apps/web/e2e/entity-management/worker-access.spec.ts
// E2E tests for managing worker project access.
// Verifies add/remove project access and multi-project assignments.
import { test, expect } from '../fixtures';
import { WorkerListPage, WorkerDetailPage } from '../page-objects';

test.describe('Worker Project Access Management', () => {
  test.beforeEach(async ({ authenticatedPage: page, seedData }) => {
    // Seed a worker and two projects to manage access.
    seedData({});
  });

  test('add project access to worker', async ({ authenticatedPage: page }) => {
    const workerDetail = new WorkerDetailPage(page);
    await workerDetail.goto('seeded-worker-id');

    // Verify no project access initially.
    const emptyMessage = page.getByText(/no project access/i);
    await expect(emptyMessage).toBeVisible();

    // Add project access.
    await workerDetail.addProjectAccess('E2E Test Project');

    // Verify the project appears in the access table.
    await workerDetail.expectProjectAccess('E2E Test Project');
  });

  test('remove project access from worker', async ({ authenticatedPage: page }) => {
    // Seed a worker that already has project access.
    const workerDetail = new WorkerDetailPage(page);
    await workerDetail.goto('worker-with-access-id');

    // Verify the project is in the access table.
    await workerDetail.expectProjectAccess('E2E Test Project');

    // Remove project access.
    await workerDetail.removeProjectAccess('E2E Test Project');

    // Verify the project is no longer in the access table.
    await workerDetail.expectNoProjectAccess('E2E Test Project');
  });

  test('add worker to multiple projects', async ({ authenticatedPage: page }) => {
    const workerDetail = new WorkerDetailPage(page);
    await workerDetail.goto('seeded-worker-id');

    // Add access to two projects.
    await workerDetail.addProjectAccess('Project Alpha');
    await workerDetail.addProjectAccess('Project Beta');

    // Verify both projects appear in the access table.
    await workerDetail.expectProjectAccess('Project Alpha');
    await workerDetail.expectProjectAccess('Project Beta');

    // Verify the access count is correct.
    const rows = workerDetail.projectAccessTable.getByRole('row');
    // 2 data rows + 1 header = 3
    await expect(rows).toHaveCount(3);
  });

  test('removing one project does not affect other project access', async ({
    authenticatedPage: page,
  }) => {
    const workerDetail = new WorkerDetailPage(page);
    await workerDetail.goto('worker-with-multi-access-id');

    // Verify both projects are accessible.
    await workerDetail.expectProjectAccess('Project Alpha');
    await workerDetail.expectProjectAccess('Project Beta');

    // Remove access to one project.
    await workerDetail.removeProjectAccess('Project Alpha');

    // Verify only the removed project is gone.
    await workerDetail.expectNoProjectAccess('Project Alpha');
    await workerDetail.expectProjectAccess('Project Beta');
  });
});
```

## Acceptance Criteria

- [ ] Test verifies an empty worker detail page shows "no project access" message
- [ ] Test verifies adding project access shows the project in the access table with a success toast
- [ ] Test verifies removing project access removes the project from the table with a success toast
- [ ] Test verifies a worker can be added to multiple projects simultaneously
- [ ] Test verifies the access table row count is correct after adding multiple projects
- [ ] Test verifies removing one project does not affect other project access entries
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- Project access is managed via a many-to-many relationship between workers and projects. The API exposes `POST /api/v1/workers/:id/projects` and `DELETE /api/v1/workers/:id/projects/:projectId`.
- The add project access UI uses a dropdown that lists available projects (projects the worker does not yet have access to).
- The remove button in each row triggers a confirmation dialog before actually removing access, preventing accidental revocation.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — worker management)
- **Functional Requirements:** FR-WORKER-002 (worker project access management)
- **Design Specification:** Worker detail page, project access table, add/remove controls

## Estimated Complexity

Small — The project access management UI follows a standard CRUD pattern with a table, add button, and remove button. The tests verify basic add/remove operations with straightforward assertions.
