// apps/web/e2e/entity-management/worker-access.spec.ts
// E2E tests for managing worker project access.
// Verifies add/remove project access and multi-project assignments.
import { test, expect } from '../fixtures';
import { createMockWorker, createMockProject } from '../fixtures/entity-factories';
import { WorkerDetailPage } from '../page-objects';
import { triggerQueryRefetch } from '../utils';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/** Builds a worker with no project access and two available projects. */
function buildWorkerNoAccessSeed() {
  const projectAlpha = createMockProject({
    id: 'project-alpha-id',
    name: 'Project Alpha',
    status: 'ready',
  });

  const projectBeta = createMockProject({
    id: 'project-beta-id',
    name: 'Project Beta',
    status: 'ready',
  });

  const worker = createMockWorker({
    id: 'worker-no-access-id',
    name: 'Access Test Worker',
    status: 'active',
    projectIds: [],
  });

  return {
    projects: [toEntry(projectAlpha), toEntry(projectBeta)],
    workers: [toEntry(worker)],
  };
}

/** Builds a worker that already has access to Project Alpha. */
function buildWorkerWithSingleAccessSeed() {
  const projectAlpha = createMockProject({
    id: 'project-alpha-id',
    name: 'Project Alpha',
    status: 'ready',
  });

  const projectBeta = createMockProject({
    id: 'project-beta-id',
    name: 'Project Beta',
    status: 'ready',
  });

  const worker = createMockWorker({
    id: 'worker-single-access-id',
    name: 'Single Access Worker',
    status: 'active',
    projectIds: [projectAlpha.id],
  });

  return {
    projects: [toEntry(projectAlpha), toEntry(projectBeta)],
    workers: [toEntry(worker)],
  };
}

/** Builds a worker that already has access to both Project Alpha and Project Beta. */
function buildWorkerWithMultiAccessSeed() {
  const projectAlpha = createMockProject({
    id: 'project-alpha-id',
    name: 'Project Alpha',
    status: 'ready',
  });

  const projectBeta = createMockProject({
    id: 'project-beta-id',
    name: 'Project Beta',
    status: 'ready',
  });

  const worker = createMockWorker({
    id: 'worker-multi-access-id',
    name: 'Multi Access Worker',
    status: 'active',
    projectIds: [projectAlpha.id, projectBeta.id],
  });

  return {
    projects: [toEntry(projectAlpha), toEntry(projectBeta)],
    workers: [toEntry(worker)],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Worker Project Access Management', () => {
  test('empty worker detail page shows no project access message', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildWorkerNoAccessSeed());

    const workerDetail = new WorkerDetailPage(page);
    await workerDetail.goto('worker-no-access-id');

    // Verify no project access initially.
    // The empty state title is "No Projects Assigned".
    const emptyMessage = page.getByText(/no projects assigned/i);
    await expect(emptyMessage).toBeVisible();
  });

  test('add project access shows the project in the access table with a success toast', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildWorkerNoAccessSeed());

    const workerDetail = new WorkerDetailPage(page);
    await workerDetail.goto('worker-no-access-id');

    // Verify no project access initially.
    const emptyMessage = page.getByText(/no projects assigned/i);
    await expect(emptyMessage).toBeVisible();

    // Add project access — this triggers the POST endpoint and expects
    // a success toast via the page object's addProjectAccess method.
    await workerDetail.addProjectAccess('Project Alpha');

    // Verify the project appears in the access table.
    await workerDetail.expectProjectAccess('Project Alpha');
  });

  test('remove project access removes the project from the table with a success toast', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildWorkerWithSingleAccessSeed());

    const workerDetail = new WorkerDetailPage(page);
    await workerDetail.goto('worker-single-access-id');

    // Verify the project is in the access table.
    await workerDetail.expectProjectAccess('Project Alpha');

    // Remove project access — this triggers the DELETE endpoint with
    // a confirmation dialog and expects a success toast.
    await workerDetail.removeProjectAccess('Project Alpha');

    // Verify the project is no longer in the access table.
    await workerDetail.expectNoProjectAccess('Project Alpha');
  });

  test('worker can be added to multiple projects simultaneously', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildWorkerNoAccessSeed());

    const workerDetail = new WorkerDetailPage(page);
    await workerDetail.goto('worker-no-access-id');

    // Add access to two projects.
    await workerDetail.addProjectAccess('Project Alpha');
    await workerDetail.addProjectAccess('Project Beta');

    // Trigger a refetch so the table reflects the updated state.
    await triggerQueryRefetch(page);

    // Verify both projects appear in the access table.
    await workerDetail.expectProjectAccess('Project Alpha');
    await workerDetail.expectProjectAccess('Project Beta');

    // Verify the access count is correct: 2 data rows + 1 header = 3.
    const rows = workerDetail.projectAccessTable.getByRole('row');
    await expect(rows).toHaveCount(3);
  });

  test('removing one project does not affect other project access entries', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildWorkerWithMultiAccessSeed());

    const workerDetail = new WorkerDetailPage(page);
    await workerDetail.goto('worker-multi-access-id');

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
