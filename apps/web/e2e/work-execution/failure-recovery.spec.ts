// apps/web/e2e/work-execution/failure-recovery.spec.ts
// E2E tests for the failure recovery flow.
// Covers: worker fails story -> error displayed -> human reviews ->
// edits task -> resets story -> worker picks up again.
import { test, expect } from '../fixtures';
import {
  createMockProject,
  createMockEpic,
  createMockStory,
  createMockTask,
  createMockWorker,
  createMockPersona,
  createMockAttempt,
} from '../fixtures/entity-factories';
import { StoryDetailPage, TaskDetailPage } from '../page-objects';
import { triggerQueryRefetch } from '../utils';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/**
 * Builds seed data for an in-progress story assigned to a worker.
 * Used by the first test to simulate the worker failing the story.
 */
function buildInProgressStorySeed() {
  const persona = createMockPersona({
    id: 'persona-backend',
    title: 'Backend Developer',
  });

  const project = createMockProject({
    id: 'project-failure-test',
    name: 'Failure Recovery Project',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'epic-failure-test',
    projectId: project.id,
    title: 'Core Feature Epic',
    status: 'ready',
  });

  const worker = createMockWorker({
    id: 'test-worker-id',
    name: 'Test Worker',
    projectIds: [project.id],
  });

  const story = createMockStory({
    id: 'in-progress-story-id',
    epicId: epic.id,
    title: 'Implement Auth Module',
    description: 'Implement the authentication module',
    status: 'in-progress',
    assignedWorkerId: worker.id,
  });

  const task1 = createMockTask({
    id: 'task-1-id',
    storyId: story.id,
    title: 'Setup Database Schema',
    description: 'Create the database schema for auth',
    personaId: persona.id,
    status: 'completed',
    acceptanceCriteria: ['Schema is created'],
  });

  const task2 = createMockTask({
    id: 'task-2-id',
    storyId: story.id,
    title: 'Implement API Endpoint',
    description: 'Implement the auth API endpoint',
    personaId: persona.id,
    status: 'in-progress',
    acceptanceCriteria: ['API responds correctly'],
    dependsOn: [task1.id],
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    tasks: [toEntry(task1), toEntry(task2)],
    workers: [toEntry(worker)],
    personas: [toEntry(persona)],
  };
}

/**
 * Builds seed data for a story that has been reset to not-started
 * after a previous failure. Used to test re-assignment.
 */
function buildResetStorySeed() {
  const persona = createMockPersona({
    id: 'persona-backend',
    title: 'Backend Developer',
  });

  const project = createMockProject({
    id: 'project-reset-test',
    name: 'Reset Recovery Project',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'epic-reset-test',
    projectId: project.id,
    title: 'Core Feature Epic',
    status: 'ready',
  });

  const worker = createMockWorker({
    id: 'test-worker-id',
    name: 'Test Worker',
    projectIds: [project.id],
  });

  const story = createMockStory({
    id: 'reset-story-id',
    epicId: epic.id,
    title: 'Implement Auth Module',
    description: 'Implement the authentication module',
    status: 'not-started',
    assignedWorkerId: null,
  });

  const task = createMockTask({
    id: 'task-reset-1',
    storyId: story.id,
    title: 'Implement API Endpoint',
    description: 'Implement the auth API endpoint with corrected types',
    personaId: persona.id,
    status: 'not-started',
    acceptanceCriteria: ['API responds correctly'],
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    tasks: [toEntry(task)],
    workers: [toEntry(worker)],
    personas: [toEntry(persona)],
  };
}

/**
 * Builds seed data for a story with a previous failed attempt
 * recorded in the attempt history. Used to verify attempt display.
 */
function buildStoryWithFailedAttemptSeed() {
  const persona = createMockPersona({
    id: 'persona-backend',
    title: 'Backend Developer',
  });

  const project = createMockProject({
    id: 'project-attempt-test',
    name: 'Attempt History Project',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'epic-attempt-test',
    projectId: project.id,
    title: 'Core Feature Epic',
    status: 'ready',
  });

  const worker = createMockWorker({
    id: 'test-worker-id',
    name: 'Test Worker',
    projectIds: [project.id],
  });

  const story = createMockStory({
    id: 'story-with-failed-attempt-id',
    epicId: epic.id,
    title: 'Implement Auth Module',
    description: 'Implement the authentication module',
    status: 'not-started',
    assignedWorkerId: null,
  });

  const task = createMockTask({
    id: 'task-attempt-1',
    storyId: story.id,
    title: 'Implement API Endpoint',
    description: 'Implement the auth API endpoint',
    personaId: persona.id,
    status: 'not-started',
    acceptanceCriteria: ['API responds correctly'],
  });

  const failedAttempt = createMockAttempt({
    id: 'attempt-1',
    storyId: story.id,
    workerId: worker.id,
    workerName: worker.name,
    status: 'failed',
    errorMessage: 'TypeScript compilation error in auth module',
    startedAt: '2026-03-01T10:00:00.000Z',
    endedAt: '2026-03-01T10:15:00.000Z',
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    tasks: [toEntry(task)],
    workers: [toEntry(worker)],
    personas: [toEntry(persona)],
    attempts: [{ ...failedAttempt }],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Failure Recovery Flow', () => {
  test('worker failure displays error and allows human reset', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story that is in-progress (assigned to a worker).
    await seedData(buildInProgressStorySeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('project-failure-test', 'in-progress-story-id');
    await storyDetail.expectStatus('In Progress');
    await storyDetail.expectAssignedWorker('Test Worker');

    // Step 1: Simulate the worker marking the story as failed.
    await page.evaluate(async () => {
      await fetch('/api/v1/stories/in-progress-story-id/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorMessage: 'Build failed: TypeScript compilation error in auth module',
          failedTaskId: 'task-2-id',
        }),
      });
    });

    // Step 2: Wait for polling to update the UI.
    await triggerQueryRefetch(page);
    await storyDetail.goto('project-failure-test', 'in-progress-story-id');

    // Verify the Failed badge is displayed.
    await storyDetail.expectStatus('Failed');

    // Verify the error message is displayed on the story detail.
    await storyDetail.expectFailedWithError(
      'Build failed: TypeScript compilation error in auth module',
    );

    // Step 3: Human reviews the failure and edits the problematic task.
    // Navigate to the failed task to make corrections.
    await storyDetail.openTask('Implement API Endpoint');
    const taskDetail = new TaskDetailPage(page);

    // Edit the task description to fix the issue.
    await taskDetail.editButton.click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel(/description/i).clear();
    await modal
      .getByLabel(/description/i)
      .fill('Implement API endpoint with corrected TypeScript types for auth module');
    await modal.getByRole('button', { name: /save/i }).click();

    // Step 4: Navigate back to the story and click Reset.
    await page.goBack();
    await storyDetail.goto('project-failure-test', 'in-progress-story-id');
    await storyDetail.resetStory();

    // Step 5: Verify the story returns to not-started status.
    await storyDetail.expectStatus('Not Started');

    // Verify the error message is no longer displayed.
    await expect(storyDetail.failedErrorMessage).not.toBeVisible();

    // Verify the worker assignment is cleared.
    await expect(storyDetail.assignedWorkerBadge).not.toBeVisible();
  });

  test('reset story allows worker to pick it up again', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a failed story that has been reset to not-started.
    await seedData(buildResetStorySeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('project-reset-test', 'reset-story-id');
    await storyDetail.expectStatus('Not Started');

    // Simulate a worker requesting work again.
    await page.evaluate(async () => {
      await fetch('/api/v1/work/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerId: 'test-worker-id' }),
      });
    });

    await triggerQueryRefetch(page);
    await storyDetail.goto('project-reset-test', 'reset-story-id');

    // Verify the story is assigned again.
    await storyDetail.expectStatus('In Progress');
    await storyDetail.expectAssignedWorker('Test Worker');
  });

  test('failed story shows in attempt history', async ({ authenticatedPage: page, seedData }) => {
    // Seed a story with a previous failed attempt.
    await seedData(buildStoryWithFailedAttemptSeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('project-attempt-test', 'story-with-failed-attempt-id');

    // Open the Attempt History tab.
    const attemptRows = await storyDetail.getAttemptHistoryRows();

    // Verify at least one attempt is logged.
    await expect(attemptRows.first()).toBeVisible();

    // Verify the failed attempt includes the error message.
    await expect(attemptRows.first()).toContainText('Failed');
    await expect(attemptRows.first()).toContainText('TypeScript compilation error');
  });
});
