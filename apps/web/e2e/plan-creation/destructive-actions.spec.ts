// apps/web/e2e/plan-creation/destructive-actions.spec.ts
// E2E tests for destructive action confirmation modals.
// Verifies cancel/confirm behavior, cascading delete counts,
// and deletion blocking for in-progress entities.
import { test, expect } from '../fixtures';
import {
  createMockProject,
  createMockEpic,
  createMockStory,
  createMockTask,
  createMockPersona,
} from '../fixtures/entity-factories';
import {
  ProjectListPage,
  ProjectDetailPage,
  EpicDetailPage,
  StoryDetailPage,
  TaskDetailPage,
} from '../page-objects';
import { handleConfirmationModal } from '../utils';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/**
 * Builds a project with 2 epics, 3 stories, and 5 tasks.
 * Used by the cascading delete tests (tests 1-3).
 */
function buildProjectWithChildrenSeed() {
  const persona = createMockPersona({
    id: 'persona-dest',
    title: 'Backend Developer',
  });

  const project = createMockProject({
    id: 'seeded-project-id',
    name: 'E2E Test Plan',
    status: 'draft',
  });

  const epic1 = createMockEpic({
    id: 'dest-epic-1',
    projectId: project.id,
    title: 'Epic One',
    status: 'draft',
  });

  const epic2 = createMockEpic({
    id: 'dest-epic-2',
    projectId: project.id,
    title: 'Epic Two',
    status: 'draft',
  });

  const story1 = createMockStory({
    id: 'dest-story-1-1',
    epicId: epic1.id,
    title: 'Story 1-1',
    status: 'draft',
  });

  const story2 = createMockStory({
    id: 'dest-story-1-2',
    epicId: epic1.id,
    title: 'Story 1-2',
    status: 'draft',
  });

  const story3 = createMockStory({
    id: 'dest-story-2-1',
    epicId: epic2.id,
    title: 'Story 2-1',
    status: 'draft',
  });

  const task1 = createMockTask({
    id: 'dest-task-1',
    storyId: story1.id,
    title: 'Task 1',
    personaId: persona.id,
  });

  const task2 = createMockTask({
    id: 'dest-task-2',
    storyId: story1.id,
    title: 'Task 2',
    personaId: persona.id,
  });

  const task3 = createMockTask({
    id: 'dest-task-3',
    storyId: story2.id,
    title: 'Task 3',
    personaId: persona.id,
  });

  const task4 = createMockTask({
    id: 'dest-task-4',
    storyId: story2.id,
    title: 'Task 4',
    personaId: persona.id,
  });

  const task5 = createMockTask({
    id: 'dest-task-5',
    storyId: story3.id,
    title: 'Task 5',
    personaId: persona.id,
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic1), toEntry(epic2)],
    stories: [toEntry(story1), toEntry(story2), toEntry(story3)],
    tasks: [toEntry(task1), toEntry(task2), toEntry(task3), toEntry(task4), toEntry(task5)],
    personas: [toEntry(persona)],
  };
}

/**
 * Builds an epic with 2 stories and 3 tasks (for epic delete test).
 */
function buildEpicWithChildrenSeed() {
  const persona = createMockPersona({
    id: 'persona-epic-del',
    title: 'Backend Developer',
  });

  const project = createMockProject({
    id: 'epic-del-project-id',
    name: 'Epic Delete Project',
    status: 'draft',
  });

  const epic = createMockEpic({
    id: 'seeded-epic-id',
    projectId: project.id,
    title: 'Epic To Delete',
    status: 'draft',
  });

  const story1 = createMockStory({
    id: 'epic-del-story-1',
    epicId: epic.id,
    title: 'Epic Story 1',
    status: 'draft',
  });

  const story2 = createMockStory({
    id: 'epic-del-story-2',
    epicId: epic.id,
    title: 'Epic Story 2',
    status: 'draft',
  });

  const task1 = createMockTask({
    id: 'epic-del-task-1',
    storyId: story1.id,
    title: 'Epic Task 1',
    personaId: persona.id,
  });

  const task2 = createMockTask({
    id: 'epic-del-task-2',
    storyId: story1.id,
    title: 'Epic Task 2',
    personaId: persona.id,
  });

  const task3 = createMockTask({
    id: 'epic-del-task-3',
    storyId: story2.id,
    title: 'Epic Task 3',
    personaId: persona.id,
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story1), toEntry(story2)],
    tasks: [toEntry(task1), toEntry(task2), toEntry(task3)],
    personas: [toEntry(persona)],
  };
}

/**
 * Builds a story with 2 tasks (for story delete test).
 */
function buildStoryWithTasksSeed() {
  const persona = createMockPersona({
    id: 'persona-story-del',
    title: 'Backend Developer',
  });

  const project = createMockProject({
    id: 'story-del-project-id',
    name: 'Story Delete Project',
    status: 'draft',
  });

  const epic = createMockEpic({
    id: 'story-del-epic-id',
    projectId: project.id,
    title: 'Story Delete Epic',
    status: 'draft',
  });

  const story = createMockStory({
    id: 'seeded-story-id',
    epicId: epic.id,
    title: 'Story To Delete',
    status: 'draft',
  });

  const task1 = createMockTask({
    id: 'story-del-task-1',
    storyId: story.id,
    title: 'Story Task 1',
    personaId: persona.id,
  });

  const task2 = createMockTask({
    id: 'story-del-task-2',
    storyId: story.id,
    title: 'Story Task 2',
    personaId: persona.id,
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    tasks: [toEntry(task1), toEntry(task2)],
    personas: [toEntry(persona)],
  };
}

/**
 * Builds a single task for task delete test.
 */
function buildSingleTaskSeed() {
  const persona = createMockPersona({
    id: 'persona-task-del',
    title: 'Backend Developer',
  });

  const project = createMockProject({
    id: 'task-del-project-id',
    name: 'Task Delete Project',
    status: 'draft',
  });

  const epic = createMockEpic({
    id: 'task-del-epic-id',
    projectId: project.id,
    title: 'Task Delete Epic',
    status: 'draft',
  });

  const story = createMockStory({
    id: 'task-del-story-id',
    epicId: epic.id,
    title: 'Task Delete Story',
    status: 'draft',
  });

  const task = createMockTask({
    id: 'seeded-task-id',
    storyId: story.id,
    title: 'Task To Delete',
    personaId: persona.id,
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    tasks: [toEntry(task)],
    personas: [toEntry(persona)],
  };
}

/**
 * Builds a story that is in-progress (for deletion-blocked test).
 */
function buildInProgressStorySeed() {
  const project = createMockProject({
    id: 'ip-project-id',
    name: 'In-Progress Project',
    status: 'draft',
  });

  const epic = createMockEpic({
    id: 'ip-epic-id',
    projectId: project.id,
    title: 'In-Progress Epic',
    status: 'draft',
  });

  const story = createMockStory({
    id: 'in-progress-story-id',
    epicId: epic.id,
    title: 'In-Progress Story',
    status: 'in-progress',
    assignedWorkerId: 'some-worker-id',
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
  };
}

/**
 * Builds a project with an in-progress child story (for project deletion-blocked test).
 */
function buildProjectWithInProgressChildSeed() {
  const project = createMockProject({
    id: 'project-with-in-progress-story-id',
    name: 'Project With In-Progress Child',
    status: 'draft',
  });

  const epic = createMockEpic({
    id: 'ip-child-epic-id',
    projectId: project.id,
    title: 'Epic With IP Story',
    status: 'draft',
  });

  const story = createMockStory({
    id: 'ip-child-story-id',
    epicId: epic.id,
    title: 'In-Progress Child Story',
    status: 'in-progress',
    assignedWorkerId: 'some-worker-id',
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Destructive Action Confirmations', () => {
  test('delete project with children shows entity counts in confirmation modal', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a project with 2 epics, 3 stories, and 5 tasks.
    await seedData(buildProjectWithChildrenSeed());

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
    await seedData(buildProjectWithChildrenSeed());

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
    await seedData(buildProjectWithChildrenSeed());

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
    await seedData(buildEpicWithChildrenSeed());

    const epicDetail = new EpicDetailPage(page);
    await epicDetail.goto('epic-del-project-id', 'seeded-epic-id');

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
    await seedData(buildStoryWithTasksSeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('story-del-project-id', 'seeded-story-id');

    await storyDetail.deleteButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/tasks/i);

    // Confirm the deletion using the actual destructive label.
    await dialog.getByRole('button', { name: /delete story/i }).click();

    // Verify redirect to the parent epic.
    await expect(page).toHaveURL(/\/epics\//);
  });

  test('delete task shows confirmation and removes task', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildSingleTaskSeed());

    // Navigate to a task and delete it.
    const taskDetail = new TaskDetailPage(page);
    await taskDetail.goto('task-del-project-id', 'seeded-task-id');
    await taskDetail.deleteButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Confirm the deletion using the actual destructive label.
    await dialog.getByRole('button', { name: /delete task/i }).click();

    // Verify redirect to the parent story.
    await expect(page).toHaveURL(/\/stories\//);
  });

  test('deletion blocked when entity is in-progress', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story that is currently in-progress (assigned to a worker).
    await seedData(buildInProgressStorySeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('ip-project-id', 'in-progress-story-id');

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
    await seedData(buildProjectWithInProgressChildSeed());

    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto('project-with-in-progress-story-id');

    // The delete button should be disabled.
    await expect(projectDetail.deleteButton).toBeDisabled();
  });
});
