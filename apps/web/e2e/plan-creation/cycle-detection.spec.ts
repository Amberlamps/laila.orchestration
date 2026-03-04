// apps/web/e2e/plan-creation/cycle-detection.spec.ts
// E2E tests for dependency cycle detection.
// Verifies that the UI prevents circular dependencies and shows
// the cycle path in an inline error message.
import { test, expect } from '../fixtures';
import {
  createMockProject,
  createMockEpic,
  createMockStory,
  createMockTask,
  createMockPersona,
} from '../fixtures/entity-factories';
import { TaskDetailPage } from '../page-objects';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/**
 * Builds a project with a linear dependency chain:
 * Task A → Task B → Task C, plus an unrelated Task D.
 */
function buildCycleDetectionSeed() {
  const persona = createMockPersona({
    id: 'persona-cycle',
    title: 'Backend Developer',
  });

  const project = createMockProject({
    id: 'cycle-project-id',
    name: 'Cycle Detection Project',
    status: 'draft',
  });

  const epic = createMockEpic({
    id: 'cycle-epic-id',
    projectId: project.id,
    title: 'Cycle Epic',
    status: 'draft',
  });

  const story = createMockStory({
    id: 'cycle-story-id',
    epicId: epic.id,
    title: 'Cycle Story',
    status: 'draft',
  });

  const taskA = createMockTask({
    id: 'task-a-id',
    storyId: story.id,
    title: 'Task A - Setup Database Schema',
    personaId: persona.id,
    acceptanceCriteria: ['Schema created'],
    dependsOn: [],
  });

  const taskB = createMockTask({
    id: 'task-b-id',
    storyId: story.id,
    title: 'Task B - Implement API Endpoint',
    personaId: persona.id,
    acceptanceCriteria: ['API works'],
    dependsOn: [taskA.id],
  });

  const taskC = createMockTask({
    id: 'task-c-id',
    storyId: story.id,
    title: 'Task C - Write Integration Tests',
    personaId: persona.id,
    acceptanceCriteria: ['Tests pass'],
    dependsOn: [taskB.id],
  });

  const taskD = createMockTask({
    id: 'task-d-id',
    storyId: story.id,
    title: 'Task D - Deploy to Staging',
    personaId: persona.id,
    acceptanceCriteria: ['Deployed'],
    dependsOn: [],
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    tasks: [toEntry(taskA), toEntry(taskB), toEntry(taskC), toEntry(taskD)],
    personas: [toEntry(persona)],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Dependency Cycle Detection', () => {
  test('adding circular dependency shows inline error with cycle path', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed three tasks with a linear dependency chain:
    // Task A → Task B → Task C
    // Then attempt to add Task C → Task A (creating a cycle).
    await seedData(buildCycleDetectionSeed());

    // Navigate to Task C's detail page.
    const taskDetail = new TaskDetailPage(page);
    await taskDetail.goto('cycle-project-id', 'task-c-id');

    // Verify existing dependency (Task C → Task B).
    await taskDetail.expectDependency('Task B - Implement API Endpoint');

    // Attempt to add a dependency on Task A, which would create a cycle:
    // Task A → Task B → Task C → Task A
    await taskDetail.addDependency('Task A - Setup Database Schema');

    // Verify the cycle error is displayed inline.
    await taskDetail.expectCycleError();

    // Verify the error message shows the cycle path.
    const cycleError = page.getByTestId('cycle-error');
    await expect(cycleError).toContainText('Task A');
    await expect(cycleError).toContainText('Task B');
    await expect(cycleError).toContainText('Task C');
  });

  test('circular dependency is not persisted after error', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Same setup: Task A → Task B → Task C.
    await seedData(buildCycleDetectionSeed());

    const taskDetail = new TaskDetailPage(page);
    await taskDetail.goto('cycle-project-id', 'task-c-id');

    // Attempt cycle: Task C → Task A.
    await taskDetail.addDependency('Task A - Setup Database Schema');
    await taskDetail.expectCycleError();

    // Reload the page to verify the dependency was not saved.
    await page.reload();
    await taskDetail.goto('cycle-project-id', 'task-c-id');

    // Task C should only have Task B as a dependency, not Task A.
    await taskDetail.expectDependency('Task B - Implement API Endpoint');
    const dependencySection = page.getByTestId('dependencies-section');
    await expect(dependencySection).not.toContainText('Task A');
  });

  test('self-dependency is rejected', async ({ authenticatedPage: page, seedData }) => {
    // Attempt to add a task as a dependency on itself.
    await seedData(buildCycleDetectionSeed());

    const taskDetail = new TaskDetailPage(page);
    await taskDetail.goto('cycle-project-id', 'task-a-id');

    // Try to add Task A as its own dependency.
    await taskDetail.addDependency('Task A - Setup Database Schema');

    // Verify the error is displayed (self-dependency is a trivial cycle).
    await taskDetail.expectCycleError();
  });

  test('valid dependency is accepted after cycle error is dismissed', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // After a cycle error, adding a valid dependency should work.
    await seedData(buildCycleDetectionSeed());

    const taskDetail = new TaskDetailPage(page);
    await taskDetail.goto('cycle-project-id', 'task-c-id');

    // First, trigger a cycle error.
    await taskDetail.addDependency('Task A - Setup Database Schema');
    await taskDetail.expectCycleError();

    // Dismiss the error (click away or close).
    await page.keyboard.press('Escape');

    // Now add a valid dependency (e.g., on a new unrelated Task D).
    // This verifies the UI recovers from the error state.
    await taskDetail.addDependency('Task D - Deploy to Staging');
    await taskDetail.expectDependency('Task D - Deploy to Staging');

    // Verify no cycle error this time.
    const cycleError = page.getByTestId('cycle-error');
    await expect(cycleError).not.toBeVisible();
  });
});
