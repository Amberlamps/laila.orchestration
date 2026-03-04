// E2E tests for the complete plan creation journey.
// Covers: project creation → epic → story → tasks with personas → dependencies.
// Verifies the entire entity hierarchy can be built through the UI.
import { test, expect } from '../fixtures';
import { createMockPersona } from '../fixtures/entity-factories';
import {
  ProjectListPage,
  ProjectDetailPage,
  EpicDetailPage,
  StoryDetailPage,
  TaskDetailPage,
} from '../page-objects';
import { navigateToProject } from '../utils';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/** Seed the three personas used by the task creation flow. */
function buildPersonasSeed() {
  const backend = createMockPersona({
    id: 'persona-backend',
    title: 'Backend Developer',
    description: 'Handles server-side logic',
  });
  const frontend = createMockPersona({
    id: 'persona-frontend',
    title: 'Frontend Developer',
    description: 'Handles client-side UI',
  });
  const qa = createMockPersona({
    id: 'persona-qa',
    title: 'QA Engineer',
    description: 'Handles testing',
  });
  return {
    personas: [toEntry(backend), toEntry(frontend), toEntry(qa)],
  };
}

test.describe('Full Plan Creation Flow', () => {
  test('create complete plan: project → epic → story → tasks → dependencies', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed personas so they appear in the persona dropdown when creating tasks.
    await seedData(buildPersonasSeed());

    // Step 1: Create a project.
    const projectList = new ProjectListPage(page);
    await projectList.goto();
    await projectList.createProject(
      'E2E Integration Project',
      'A project created end-to-end via Playwright',
    );
    await projectList.expectProjectInList('E2E Integration Project');

    // Step 2: Open the project and create an epic.
    await projectList.openProject('E2E Integration Project');
    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.expectStatus('Draft');
    await projectDetail.createEpic(
      'User Authentication Epic',
      'Implement the complete authentication system',
    );

    // Step 3: Open the epic and create a user story.
    await projectDetail.openEpic('User Authentication Epic');
    const epicDetail = new EpicDetailPage(page);
    await epicDetail.expectStatus('Draft');
    await epicDetail.createStory(
      'Implement Login Flow',
      'Users should be able to sign in with Google OAuth',
    );

    // Step 4: Open the story and create tasks with persona assignments.
    await epicDetail.openStory('Implement Login Flow');
    const storyDetail = new StoryDetailPage(page);
    await storyDetail.expectStatus('Draft');

    // Create three tasks that form a dependency chain.
    await storyDetail.createTask(
      'Configure Auth Provider',
      'Set up Better Auth with Google OAuth',
      'Backend Developer',
    );
    await storyDetail.createTask(
      'Build Login Page UI',
      'Create the sign-in page with Google button',
      'Frontend Developer',
    );
    await storyDetail.createTask(
      'Write Auth Integration Tests',
      'Test the complete OAuth flow',
      'QA Engineer',
    );

    // Step 5: Navigate to task detail and add dependencies.
    // "Build Login Page UI" depends on "Configure Auth Provider"
    await storyDetail.openTask('Build Login Page UI');
    const taskDetail = new TaskDetailPage(page);
    await taskDetail.addDependency('Configure Auth Provider');
    await taskDetail.expectDependency('Configure Auth Provider');

    // Navigate back and add dependency for the test task.
    await page.goBack();
    await storyDetail.openTask('Write Auth Integration Tests');
    await taskDetail.addDependency('Build Login Page UI');
    await taskDetail.expectDependency('Build Login Page UI');

    // Step 6: Verify the DAG is valid (no cycles).
    // Navigate to the project graph view to visually confirm.
    await page.goto('/projects');
    await navigateToProject(page, 'E2E Integration Project');
    const projectDetailPage = new ProjectDetailPage(page);
    await projectDetailPage.graphTab.click();

    // The graph should render without errors if DAG is valid.
    const graphCanvas = page.locator('.react-flow');
    await expect(graphCanvas).toBeVisible();
  });

  test('create multiple epics and stories within a project', async ({
    authenticatedPage: page,
  }) => {
    // Create a project with multiple epics, each containing stories.
    // Verifies the UI supports complex plan structures.
    const projectList = new ProjectListPage(page);
    await projectList.goto();
    await projectList.createProject(
      'Multi-Epic Project',
      'Project with multiple epics for testing',
    );
    await projectList.openProject('Multi-Epic Project');

    const projectDetail = new ProjectDetailPage(page);

    // Create two epics.
    await projectDetail.createEpic('Epic Alpha', 'First epic');
    await projectDetail.createEpic('Epic Beta', 'Second epic');

    // Verify both epics appear in the epics table.
    await projectDetail.epicsTab.click();
    await expect(projectDetail.epicsTable.getByRole('row', { name: /Epic Alpha/ })).toBeVisible();
    await expect(projectDetail.epicsTable.getByRole('row', { name: /Epic Beta/ })).toBeVisible();

    // Create stories in each epic.
    await projectDetail.openEpic('Epic Alpha');
    const epicDetail = new EpicDetailPage(page);
    await epicDetail.createStory('Alpha Story 1', 'First story in Alpha');
    await epicDetail.createStory('Alpha Story 2', 'Second story in Alpha');

    // Verify both stories appear.
    await epicDetail.storiesTab.click();
    await expect(epicDetail.storiesTable.getByRole('row', { name: /Alpha Story 1/ })).toBeVisible();
    await expect(epicDetail.storiesTable.getByRole('row', { name: /Alpha Story 2/ })).toBeVisible();
  });

  test('task creation requires persona assignment', async ({ authenticatedPage: page }) => {
    // Attempt to create a task without selecting a persona.
    // The form should show a validation error.
    const projectList = new ProjectListPage(page);
    await projectList.goto();
    await projectList.createProject('Validation Test Project', 'Testing form validation');
    await projectList.openProject('Validation Test Project');

    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.createEpic('Validation Epic', 'Testing validation');
    await projectDetail.openEpic('Validation Epic');

    const epicDetail = new EpicDetailPage(page);
    await epicDetail.createStory('Validation Story', 'Testing task validation');
    await epicDetail.openStory('Validation Story');

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.tasksTab.click();
    await storyDetail.createTaskButton.click();

    // Fill title and description but skip persona selection.
    const modal = page.getByRole('dialog');
    await modal.getByLabel(/title/i).fill('Task Without Persona');
    await modal.getByLabel(/description/i).fill('Missing persona');
    await modal.getByRole('button', { name: /create/i }).click();

    // Verify the form shows a validation error for the persona field.
    const personaError = modal.getByText(/persona.*required/i);
    await expect(personaError).toBeVisible();
  });
});
