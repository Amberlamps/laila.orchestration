// apps/web/e2e/plan-creation/publish-flow.spec.ts
// E2E tests for the publish lifecycle.
// Tests the bottom-up publish flow: stories -> epics -> project.
// Verifies validation gates at each level and status transitions.
import { test, expect } from '../fixtures';
import {
  createMockProject,
  createMockEpic,
  createMockStory,
  createMockTask,
  createMockPersona,
} from '../fixtures/entity-factories';
import { ProjectDetailPage, EpicDetailPage, StoryDetailPage } from '../page-objects';
import { expectErrorToast } from '../utils';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/**
 * Builds a complete, valid plan with all required fields filled.
 * All tasks have personas and acceptance criteria, making the
 * hierarchy ready for bottom-up publishing.
 */
function buildValidPlanSeed() {
  const persona = createMockPersona({
    id: 'persona-backend',
    title: 'Backend Developer',
  });

  const project = createMockProject({
    id: 'seeded-project-id',
    name: 'Publish Flow Project',
    status: 'draft',
  });

  const epic = createMockEpic({
    id: 'seeded-epic-id',
    projectId: project.id,
    title: 'Core Feature Epic',
    status: 'draft',
  });

  const story = createMockStory({
    id: 'seeded-story-id',
    epicId: epic.id,
    title: 'Implement Feature',
    status: 'draft',
  });

  const task1 = createMockTask({
    id: 'task-1',
    storyId: story.id,
    title: 'Setup Database',
    personaId: persona.id,
    acceptanceCriteria: ['Database schema is created'],
  });

  const task2 = createMockTask({
    id: 'task-2',
    storyId: story.id,
    title: 'Build API Layer',
    personaId: persona.id,
    acceptanceCriteria: ['API endpoints respond correctly'],
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
 * Builds a story with a task that is missing a persona assignment.
 * Publishing this story should be rejected by the validation gate.
 */
function buildStoryMissingPersonaSeed() {
  const project = createMockProject({
    id: 'project-incomplete',
    name: 'Incomplete Project',
    status: 'draft',
  });

  const epic = createMockEpic({
    id: 'epic-incomplete',
    projectId: project.id,
    title: 'Incomplete Epic',
    status: 'draft',
  });

  const story = createMockStory({
    id: 'story-with-incomplete-task-id',
    epicId: epic.id,
    title: 'Story Missing Persona',
    status: 'draft',
  });

  const taskMissingPersona = createMockTask({
    id: 'task-no-persona',
    storyId: story.id,
    title: 'Task Without Persona',
    personaId: '', // empty persona = missing
    acceptanceCriteria: ['Some criteria'],
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    tasks: [toEntry(taskMissingPersona)],
  };
}

/**
 * Builds a story with a task that has no acceptance criteria.
 * Publishing this story should be rejected by the validation gate.
 */
function buildStoryMissingACCriteriaSeed() {
  const project = createMockProject({
    id: 'project-no-ac',
    name: 'No AC Project',
    status: 'draft',
  });

  const epic = createMockEpic({
    id: 'epic-no-ac',
    projectId: project.id,
    title: 'No AC Epic',
    status: 'draft',
  });

  const story = createMockStory({
    id: 'story-with-no-acceptance-criteria-id',
    epicId: epic.id,
    title: 'Story Missing AC',
    status: 'draft',
  });

  const persona = createMockPersona({
    id: 'persona-for-ac-test',
    title: 'Frontend Developer',
  });

  const taskMissingAC = createMockTask({
    id: 'task-no-ac',
    storyId: story.id,
    title: 'Task Without AC',
    personaId: persona.id,
    acceptanceCriteria: [], // empty = missing
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    tasks: [toEntry(taskMissingAC)],
    personas: [toEntry(persona)],
  };
}

/**
 * Builds an epic with a story still in Draft status.
 * Publishing this epic should be rejected because not all stories are Ready.
 */
function buildEpicWithDraftStorySeed() {
  const project = createMockProject({
    id: 'project-draft-story',
    name: 'Draft Story Project',
    status: 'draft',
  });

  const epic = createMockEpic({
    id: 'epic-with-draft-story-id',
    projectId: project.id,
    title: 'Epic With Draft Story',
    status: 'draft',
  });

  const draftStory = createMockStory({
    id: 'still-draft-story',
    epicId: epic.id,
    title: 'Still Draft Story',
    status: 'draft',
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(draftStory)],
  };
}

/**
 * Builds a complete plan where all stories are already in Ready status,
 * allowing the epic to be published directly.
 */
function buildReadyForEpicPublishSeed() {
  const persona = createMockPersona({
    id: 'persona-ready',
    title: 'Backend Developer',
  });

  const project = createMockProject({
    id: 'seeded-project-id',
    name: 'Publish Flow Project',
    status: 'draft',
  });

  const epic = createMockEpic({
    id: 'seeded-epic-id',
    projectId: project.id,
    title: 'Core Feature Epic',
    status: 'draft',
  });

  const readyStory = createMockStory({
    id: 'ready-story-id',
    epicId: epic.id,
    title: 'Ready Story',
    status: 'ready',
  });

  const task = createMockTask({
    id: 'task-ready',
    storyId: readyStory.id,
    title: 'Completed Task',
    personaId: persona.id,
    acceptanceCriteria: ['Task completed'],
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(readyStory)],
    tasks: [toEntry(task)],
    personas: [toEntry(persona)],
  };
}

/**
 * Builds a complete plan where all epics are already in Ready status,
 * allowing the project to be published directly.
 */
function buildReadyForProjectPublishSeed() {
  const project = createMockProject({
    id: 'seeded-project-id',
    name: 'Publish Flow Project',
    status: 'draft',
  });

  const readyEpic = createMockEpic({
    id: 'seeded-epic-id',
    projectId: project.id,
    title: 'Core Feature Epic',
    status: 'ready',
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(readyEpic)],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Publish Flow', () => {
  test('publish story validates tasks have persona and acceptance criteria', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a complete project plan with all required fields filled.
    await seedData(buildValidPlanSeed());

    // Navigate to the story with fully configured tasks.
    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('seeded-project-id', 'seeded-story-id');

    // Verify the story is in Draft status before publishing.
    await storyDetail.expectStatus('Draft');

    // Publish the story — should succeed because all tasks
    // have persona assignments and acceptance criteria.
    await storyDetail.publish();

    // Verify the story status transitions to Ready.
    await storyDetail.expectStatus('Ready');
  });

  test('publish story rejected when task missing persona', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story where one task is missing a persona.
    await seedData(buildStoryMissingPersonaSeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('project-incomplete', 'story-with-incomplete-task-id');

    // Click publish to open the flow dialog.
    await storyDetail.publishButton.click();

    // The validate endpoint returns valid (MSW mock always passes validation),
    // so the confirm step appears. Click the publish button.
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /publish story/i }).click();

    // The publish endpoint rejects because the task is missing a persona.
    // Verify the error toast explains the validation failure.
    await expectErrorToast(page, /task.*missing.*persona/i);

    // Close the dialog and verify the story remains in Draft status.
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await storyDetail.expectStatus('Draft');
  });

  test('publish story rejected when task missing acceptance criteria', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story where one task has no acceptance criteria.
    await seedData(buildStoryMissingACCriteriaSeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('project-no-ac', 'story-with-no-acceptance-criteria-id');

    // Click publish to open the flow dialog.
    await storyDetail.publishButton.click();

    // Validation passes (MSW mock), confirm step appears.
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /publish story/i }).click();

    // The publish endpoint rejects because the task is missing acceptance criteria.
    await expectErrorToast(page, /acceptance criteria/i);

    // Verify the story remains in Draft status.
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await storyDetail.expectStatus('Draft');
  });

  test('publish epic validates all stories are Ready', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a plan where all stories are already Ready.
    await seedData(buildReadyForEpicPublishSeed());

    // Navigate to the epic. All stories must be Ready before
    // the epic can be published.
    const epicDetail = new EpicDetailPage(page);
    await epicDetail.goto('seeded-project-id', 'seeded-epic-id');
    await epicDetail.expectStatus('Draft');

    // Publish the epic — should succeed because all stories are Ready.
    await epicDetail.publish();

    // Verify the epic status transitions to Ready.
    await epicDetail.expectStatus('Ready');
  });

  test('publish epic rejected when story still in Draft', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed an epic where one story is still in Draft status.
    await seedData(buildEpicWithDraftStorySeed());

    const epicDetail = new EpicDetailPage(page);
    await epicDetail.goto('project-draft-story', 'epic-with-draft-story-id');

    // Click publish to open the flow dialog.
    await epicDetail.publishButton.click();

    // Validation passes (MSW mock), confirm step appears.
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /publish epic/i }).click();

    // The publish endpoint rejects because not all stories are Ready.
    await expectErrorToast(page, /stories.*not ready/i);

    // Verify the epic remains in Draft status.
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await epicDetail.expectStatus('Draft');
  });

  test('publish project validates all epics are Ready', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a plan where all epics are already Ready.
    await seedData(buildReadyForProjectPublishSeed());

    // Navigate to the project. All epics must be Ready.
    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto('seeded-project-id');
    await projectDetail.expectStatus('Draft');

    // Publish the project.
    await projectDetail.publish();

    // Verify the project status transitions to Ready.
    await projectDetail.expectStatus('Ready');
  });

  test('complete bottom-up publish: stories -> epic -> project', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a complete plan with valid entities in Draft status.
    // This test verifies the full bottom-up publish sequence:
    // 1. Publish each story in the epic.
    // 2. Publish the epic.
    // 3. Publish the project.
    await seedData(buildValidPlanSeed());

    // Step 1: Publish the story.
    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('seeded-project-id', 'seeded-story-id');
    await storyDetail.publish();
    await storyDetail.expectStatus('Ready');

    // Step 2: Publish the epic.
    const epicDetail = new EpicDetailPage(page);
    await epicDetail.goto('seeded-project-id', 'seeded-epic-id');
    await epicDetail.publish();
    await epicDetail.expectStatus('Ready');

    // Step 3: Publish the project.
    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto('seeded-project-id');
    await projectDetail.publish();
    await projectDetail.expectStatus('Ready');

    // Verify status transitions are reflected on the project overview.
    // All children should show Ready status in their respective tables.
    await projectDetail.epicsTab.click();
    const epicRow = projectDetail.epicsTable.getByRole('row', {
      name: /Core Feature Epic/,
    });
    await expect(epicRow).toContainText('Ready');
  });
});
