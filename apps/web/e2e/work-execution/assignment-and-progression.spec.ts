// apps/web/e2e/work-execution/assignment-and-progression.spec.ts
// E2E tests for work assignment and cascading status progression.
// Simulates the full lifecycle: publish -> worker requests work ->
// task completions -> story completes -> project completes.
import { test, expect } from '../fixtures';
import {
  createMockProject,
  createMockEpic,
  createMockStory,
  createMockTask,
  createMockWorker,
  createMockPersona,
} from '../fixtures/entity-factories';
import { DashboardPage, ProjectDetailPage, StoryDetailPage } from '../page-objects';
import { triggerQueryRefetch } from '../utils';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/**
 * Builds a published project plan ready for work assignment.
 * Project (Ready) -> Epic (Ready) -> Story (Not Started)
 * Story has 3 tasks: Task1 (not-started), Task2 (blocked by Task1),
 * Task3 (blocked by Task2).
 * Also includes a worker that can be assigned.
 */
function buildWorkAssignmentSeed() {
  const persona = createMockPersona({
    id: 'persona-backend',
    title: 'Backend Developer',
  });

  const project = createMockProject({
    id: 'seeded-project-id',
    name: 'Work Execution Project',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'seeded-epic-id',
    projectId: project.id,
    title: 'Core Feature Epic',
    status: 'ready',
  });

  const story = createMockStory({
    id: 'seeded-story-id',
    epicId: epic.id,
    title: 'Implement Feature',
    status: 'not-started',
  });

  const task1 = createMockTask({
    id: 'task-1-id',
    storyId: story.id,
    title: 'Setup Database Schema',
    personaId: persona.id,
    status: 'not-started',
    acceptanceCriteria: ['Database schema is created'],
    dependsOn: [],
  });

  const task2 = createMockTask({
    id: 'task-2-id',
    storyId: story.id,
    title: 'Implement API Endpoint',
    personaId: persona.id,
    status: 'blocked',
    acceptanceCriteria: ['API endpoint responds correctly'],
    dependsOn: [task1.id],
  });

  const task3 = createMockTask({
    id: 'task-3-id',
    storyId: story.id,
    title: 'Write Integration Tests',
    personaId: persona.id,
    status: 'blocked',
    acceptanceCriteria: ['Integration tests pass'],
    dependsOn: [task2.id],
  });

  const worker = createMockWorker({
    id: 'test-worker-id',
    name: 'Test Worker',
    status: 'active',
    projectIds: [project.id],
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    tasks: [toEntry(task1), toEntry(task2), toEntry(task3)],
    workers: [toEntry(worker)],
    personas: [toEntry(persona)],
  };
}

/**
 * Builds a project with a story already in-progress for dashboard testing.
 * Includes a worker assigned to the story.
 */
function buildInProgressSeed() {
  const project = createMockProject({
    id: 'dashboard-project-id',
    name: 'Dashboard Test Project',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'dashboard-epic-id',
    projectId: project.id,
    title: 'Dashboard Epic',
    status: 'ready',
  });

  const story = createMockStory({
    id: 'seeded-story-id',
    epicId: epic.id,
    title: 'In Progress Story',
    status: 'in-progress',
    assignedWorkerId: 'dashboard-worker-id',
  });

  const worker = createMockWorker({
    id: 'dashboard-worker-id',
    name: 'Dashboard Worker',
    status: 'active',
    projectIds: [project.id],
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    workers: [toEntry(worker)],
  };
}

/**
 * Builds a dependency chain: Task A -> Task B -> Task C.
 * Task A is not-started, B and C are blocked.
 * Completing A should unblock B but NOT C (C depends on B, not A).
 */
function buildCascadingUnblockSeed() {
  const persona = createMockPersona({
    id: 'persona-cascading',
    title: 'Backend Developer',
  });

  const project = createMockProject({
    id: 'cascading-project-id',
    name: 'Cascading Test Project',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'cascading-epic-id',
    projectId: project.id,
    title: 'Cascading Epic',
    status: 'ready',
  });

  const story = createMockStory({
    id: 'seeded-story-id',
    epicId: epic.id,
    title: 'Cascading Story',
    status: 'in-progress',
    assignedWorkerId: 'cascading-worker-id',
  });

  const taskA = createMockTask({
    id: 'task-a-id',
    storyId: story.id,
    title: 'Task A',
    personaId: persona.id,
    status: 'not-started',
    acceptanceCriteria: ['Task A completed'],
    dependsOn: [],
  });

  const taskB = createMockTask({
    id: 'task-b-id',
    storyId: story.id,
    title: 'Task B',
    personaId: persona.id,
    status: 'blocked',
    acceptanceCriteria: ['Task B completed'],
    dependsOn: [taskA.id],
  });

  const taskC = createMockTask({
    id: 'task-c-id',
    storyId: story.id,
    title: 'Task C',
    personaId: persona.id,
    status: 'blocked',
    acceptanceCriteria: ['Task C completed'],
    dependsOn: [taskB.id],
  });

  const worker = createMockWorker({
    id: 'cascading-worker-id',
    name: 'Cascading Worker',
    status: 'active',
    projectIds: [project.id],
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    tasks: [toEntry(taskA), toEntry(taskB), toEntry(taskC)],
    workers: [toEntry(worker)],
    personas: [toEntry(persona)],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Work Assignment and Status Progression', () => {
  test('full work lifecycle: assign -> task completions -> story completes -> project completes', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a published project with a ready plan:
    // Project (Ready) -> Epic (Ready) -> Story (Not Started)
    // Story has 3 tasks: Task1 (not-started), Task2 (blocked by Task1),
    // Task3 (blocked by Task2).
    await seedData(buildWorkAssignmentSeed());

    // Step 1: Verify the story is in Not Started status.
    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('seeded-project-id', 'seeded-story-id');
    await storyDetail.expectStatus('Not Started');

    // Step 2: Simulate a worker requesting work via the API.
    // This is done by triggering the MSW work-request handler
    // which assigns the first available story to a worker.
    await page.evaluate(async () => {
      await fetch('/api/v1/work/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerId: 'test-worker-id' }),
      });
    });

    // Step 3: Wait for TanStack Query refetch to pick up the change.
    // The story status should transition from Not Started to In Progress.
    await triggerQueryRefetch(page);
    await storyDetail.goto('seeded-project-id', 'seeded-story-id');
    await storyDetail.expectStatus('In Progress');
    await storyDetail.expectAssignedWorker('Test Worker');

    // Step 4: Simulate task completions in sequence.
    // Complete Task 1 -> unblocks Task 2.
    await page.evaluate(async () => {
      await fetch('/api/v1/tasks/task-1-id/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await triggerQueryRefetch(page);

    // Verify Task 1 is completed and Task 2 is now unblocked (not-started).
    await storyDetail.tasksTab.click();
    const task1Row = storyDetail.tasksTable.getByRole('row', {
      name: /Setup Database Schema/,
    });
    await expect(task1Row).toContainText('Complete');

    const task2Row = storyDetail.tasksTable.getByRole('row', {
      name: /Implement API Endpoint/,
    });
    await expect(task2Row).toContainText('Not Started');

    // Complete Task 2 -> unblocks Task 3.
    await page.evaluate(async () => {
      await fetch('/api/v1/tasks/task-2-id/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await triggerQueryRefetch(page);

    // Complete Task 3 -> all tasks done -> story auto-completes.
    await page.evaluate(async () => {
      await fetch('/api/v1/tasks/task-3-id/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await triggerQueryRefetch(page);
    await storyDetail.goto('seeded-project-id', 'seeded-story-id');

    // Step 5: Verify story auto-completed.
    await storyDetail.expectStatus('Complete');

    // Step 6: Verify project also completed (single epic, single story).
    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto('seeded-project-id');
    await projectDetail.expectStatus('Complete');
  });

  test('dashboard widgets update during work progression', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a project with a story in-progress.
    await seedData(buildInProgressSeed());

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Verify active workers shows "1" (the assigned worker).
    const activeWorkersCard = page.getByTestId('kpi-card-active-workers');
    await expect(activeWorkersCard).toBeVisible();
    await expect(activeWorkersCard).toContainText('1');

    // Simulate story completion via API — the worker is released.
    await page.evaluate(async () => {
      await fetch('/api/v1/stories/seeded-story-id/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await triggerQueryRefetch(page);

    // After completion the worker is released — active workers drops to 0.
    await expect(activeWorkersCard).toContainText('0');
  });

  test('cascading unblock updates blocked tasks to not-started', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed tasks with dependency chain: A -> B -> C.
    // B and C are blocked. Completing A should unblock B (but not C).
    await seedData(buildCascadingUnblockSeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('cascading-project-id', 'seeded-story-id');
    await storyDetail.tasksTab.click();

    // Verify initial states.
    const taskA = storyDetail.tasksTable.getByRole('row', { name: /Task A/ });
    const taskB = storyDetail.tasksTable.getByRole('row', { name: /Task B/ });
    const taskC = storyDetail.tasksTable.getByRole('row', { name: /Task C/ });
    await expect(taskA).toContainText('Not Started');
    await expect(taskB).toContainText('Blocked');
    await expect(taskC).toContainText('Blocked');

    // Complete Task A.
    await page.evaluate(async () => {
      await fetch('/api/v1/tasks/task-a-id/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await triggerQueryRefetch(page);
    await storyDetail.goto('cascading-project-id', 'seeded-story-id');
    await storyDetail.tasksTab.click();

    // Task A completed, Task B unblocked, Task C still blocked (depends on B).
    await expect(storyDetail.tasksTable.getByRole('row', { name: /Task A/ })).toContainText(
      'Complete',
    );
    await expect(storyDetail.tasksTable.getByRole('row', { name: /Task B/ })).toContainText(
      'Not Started',
    );
    await expect(storyDetail.tasksTable.getByRole('row', { name: /Task C/ })).toContainText(
      'Blocked',
    );
  });
});
