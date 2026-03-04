// apps/web/e2e/work-execution/read-only-enforcement.spec.ts
// E2E tests for read-only enforcement during in-progress states.
// Verifies that the UI prevents modifications to stories and tasks
// that are currently being worked on by an agent.
import { test, expect } from '../fixtures';
import {
  createMockProject,
  createMockEpic,
  createMockStory,
  createMockTask,
  createMockWorker,
  createMockPersona,
} from '../fixtures/entity-factories';
import { StoryDetailPage, TaskDetailPage } from '../page-objects';
import { expectButtonDisabledWithTooltip } from '../utils';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/**
 * Builds a project with an in-progress story assigned to a worker,
 * plus two tasks under that story. Used by all read-only enforcement tests.
 */
function buildInProgressStoryWithTasksSeed() {
  const persona = createMockPersona({
    id: 'persona-ro',
    title: 'Backend Developer',
  });

  const worker = createMockWorker({
    id: 'worker-ro',
    name: 'Test Agent Worker',
    status: 'active',
    projectIds: ['ro-project-id'],
  });

  const project = createMockProject({
    id: 'ro-project-id',
    name: 'Read-Only Enforcement Project',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'ro-epic-id',
    projectId: project.id,
    title: 'Read-Only Epic',
    status: 'ready',
  });

  const story = createMockStory({
    id: 'in-progress-story-id',
    epicId: epic.id,
    title: 'In-Progress Story',
    status: 'in-progress',
    assignedWorkerId: worker.id,
  });

  const task1 = createMockTask({
    id: 'ro-task-1',
    storyId: story.id,
    title: 'Setup Database Schema',
    personaId: persona.id,
    status: 'in-progress',
    acceptanceCriteria: ['Database schema is created'],
  });

  const task2 = createMockTask({
    id: 'ro-task-2',
    storyId: story.id,
    title: 'Implement API Endpoint',
    personaId: persona.id,
    status: 'blocked',
    acceptanceCriteria: ['API endpoint responds correctly'],
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Read-Only Enforcement During In-Progress', () => {
  test('in-progress story shows read-only banner', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed an in-progress story assigned to a worker.
    await seedData(buildInProgressStoryWithTasksSeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('ro-project-id', 'in-progress-story-id');

    // Verify the read-only banner is visible with appropriate messaging.
    await storyDetail.expectReadOnly();
    await expect(storyDetail.readOnlyBanner).toContainText(/read-only/i);
    await expect(storyDetail.readOnlyBanner).toContainText(/in progress/i);
  });

  test('edit and delete buttons are disabled on in-progress story', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildInProgressStoryWithTasksSeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('ro-project-id', 'in-progress-story-id');

    // Verify the edit button is disabled during in-progress.
    await expect(storyDetail.editButton).toBeDisabled();

    // Verify the delete button is disabled.
    await expect(storyDetail.deleteButton).toBeDisabled();

    // Verify hovering the disabled delete button shows a tooltip
    // explaining that deletion is blocked during in-progress.
    await expectButtonDisabledWithTooltip(page, /delete/i, /cannot delete.*in progress/i);
  });

  test('tasks under in-progress story show lock icons', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildInProgressStoryWithTasksSeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('ro-project-id', 'in-progress-story-id');

    // Navigate to a task under the in-progress story.
    await storyDetail.openTask('Setup Database Schema');

    const taskDetail = new TaskDetailPage(page);

    // Verify lock icons are displayed and edit/delete buttons are disabled.
    await taskDetail.expectReadOnly();

    // Explicitly verify each button state.
    await expect(taskDetail.editButton).toBeDisabled();
    await expect(taskDetail.deleteButton).toBeDisabled();
  });

  test('create task button is disabled on in-progress story', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildInProgressStoryWithTasksSeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('ro-project-id', 'in-progress-story-id');
    await storyDetail.tasksTab.click();

    // The "Create Task" button should be disabled because the story
    // is in-progress and its structure cannot be modified.
    await expect(storyDetail.createTaskButton).toBeDisabled();
  });

  test('API PATCH modification attempt is rejected during in-progress', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildInProgressStoryWithTasksSeed());

    // Attempt to modify the in-progress story directly via API.
    // This simulates someone bypassing the UI restrictions.
    const response: { status: number; body: { error: string } } = await page.evaluate(async () => {
      const res = await fetch('/api/v1/stories/in-progress-story-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Modified Title' }),
      });
      const body = (await res.json()) as { error: string };
      return { status: res.status, body };
    });

    // Verify the API rejects the modification with a 4xx status.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body.error).toMatch(/in.progress/i);
  });

  test('API DELETE attempt is rejected during in-progress', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildInProgressStoryWithTasksSeed());

    // Attempt to delete an in-progress story via API.
    const response: { status: number; body: { error: string } } = await page.evaluate(async () => {
      const res = await fetch('/api/v1/stories/in-progress-story-id', {
        method: 'DELETE',
      });
      const body = (await res.json()) as { error: string };
      return { status: res.status, body };
    });

    // Verify the API rejects the deletion.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body.error).toMatch(/in.progress/i);
  });

  test('dependency modification blocked on tasks under in-progress story', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildInProgressStoryWithTasksSeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('ro-project-id', 'in-progress-story-id');
    await storyDetail.openTask('Implement API Endpoint');

    const taskDetail = new TaskDetailPage(page);

    // Verify the "Add Dependency" button is disabled because the
    // parent story is in-progress and dependencies cannot be modified.
    await expect(taskDetail.addDependencyButton).toBeDisabled();
  });
});
