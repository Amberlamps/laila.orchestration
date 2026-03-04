// apps/web/e2e/entity-management/persona-crud.spec.ts
// E2E tests for persona CRUD operations with deletion guard.
// Verifies create, read, update, delete, and the referential
// integrity guard that prevents deleting personas with active tasks.
import { test, expect } from '../fixtures';
import {
  createMockPersona,
  createMockTask,
  createMockStory,
  createMockEpic,
  createMockProject,
} from '../fixtures/entity-factories';
import { PersonaListPage } from '../page-objects';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/**
 * Builds a persona with no task references (safe to delete).
 * Also includes a second persona referenced by tasks (cannot delete).
 */
function buildPersonaWithEditSeed() {
  const persona = createMockPersona({
    id: 'persona-backend',
    title: 'Backend Developer',
    description: 'Handles server-side logic',
  });

  return {
    personas: [toEntry(persona)],
  };
}

/**
 * Builds a persona referenced by active tasks (deletion blocked)
 * and an unreferenced persona (deletion allowed).
 */
function buildPersonaWithTaskReferencesSeed() {
  const referencedPersona = createMockPersona({
    id: 'persona-referenced',
    title: 'Backend Developer',
    description: 'Handles server-side logic',
  });

  const unusedPersona = createMockPersona({
    id: 'persona-unused',
    title: 'Unused Persona',
    description: 'Not referenced by any tasks',
  });

  const project = createMockProject({
    id: 'ref-project-id',
    name: 'Reference Project',
    status: 'draft',
  });

  const epic = createMockEpic({
    id: 'ref-epic-id',
    projectId: project.id,
    title: 'Reference Epic',
    status: 'draft',
  });

  const story = createMockStory({
    id: 'ref-story-id',
    epicId: epic.id,
    title: 'Reference Story',
    status: 'draft',
  });

  const task1 = createMockTask({
    id: 'ref-task-1',
    storyId: story.id,
    title: 'Task 1',
    personaId: referencedPersona.id,
  });

  const task2 = createMockTask({
    id: 'ref-task-2',
    storyId: story.id,
    title: 'Task 2',
    personaId: referencedPersona.id,
  });

  const task3 = createMockTask({
    id: 'ref-task-3',
    storyId: story.id,
    title: 'Task 3',
    personaId: referencedPersona.id,
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    tasks: [toEntry(task1), toEntry(task2), toEntry(task3)],
    personas: [toEntry(referencedPersona), toEntry(unusedPersona)],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Persona CRUD and Deletion Guard', () => {
  test('create persona and verify in list', async ({ authenticatedPage: page }) => {
    const personaList = new PersonaListPage(page);
    await personaList.goto();

    // Create a new persona.
    await personaList.createPersona(
      'Backend Developer',
      'Specializes in Node.js, TypeScript, and database design',
    );

    // Verify the persona appears in the list.
    await personaList.expectPersonaInList('Backend Developer');
  });

  test('edit persona title and description', async ({ authenticatedPage: page, seedData }) => {
    // Seed a persona to edit.
    await seedData(buildPersonaWithEditSeed());

    const personaList = new PersonaListPage(page);
    await personaList.goto();

    // Verify the original persona is in the list.
    await personaList.expectPersonaInList('Backend Developer');

    // Edit the persona.
    await personaList.editPersona(
      'Backend Developer',
      'Full-Stack Engineer',
      'Builds end-to-end features with React and Node.js',
    );

    // Verify the updated persona appears in the list.
    await personaList.expectPersonaInList('Full-Stack Engineer');

    // Verify the old title is no longer in the list.
    await personaList.expectPersonaNotInList('Backend Developer');
  });

  test('delete persona blocked when referenced by active tasks', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a persona that is referenced by tasks.
    await seedData(buildPersonaWithTaskReferencesSeed());

    const personaList = new PersonaListPage(page);
    await personaList.goto();

    // Attempt to delete the persona that has active task references.
    await personaList.expectDeletionBlocked('Backend Developer');

    // Verify the persona is still in the list (not deleted).
    await personaList.expectPersonaInList('Backend Developer');
  });

  test('delete persona succeeds after removing task references', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed personas: one referenced by tasks, one unreferenced.
    await seedData(buildPersonaWithTaskReferencesSeed());

    const personaList = new PersonaListPage(page);
    await personaList.goto();

    // Verify the unreferenced persona is in the list.
    await personaList.expectPersonaInList('Unused Persona');

    // Delete the unreferenced persona (should succeed).
    const deleted = await personaList.deletePersona('Unused Persona');
    expect(deleted).toBe(true);

    // Verify the persona is removed from the list.
    await personaList.expectPersonaNotInList('Unused Persona');
  });

  test('deletion guard tooltip shows referencing task count', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a persona referenced by 3 tasks.
    await seedData(buildPersonaWithTaskReferencesSeed());

    const personaList = new PersonaListPage(page);
    await personaList.goto();

    // Hover over the delete button to see the tooltip.
    const row = personaList.personasTable.getByRole('row', {
      name: /Backend Developer/,
    });
    const deleteButton = row.getByRole('button', { name: /delete/i });
    await deleteButton.hover();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/referenced by/i);
    await expect(tooltip).toContainText(/3 task/i);
  });

  test('full CRUD lifecycle: create → read → update → delete', async ({
    authenticatedPage: page,
  }) => {
    const personaList = new PersonaListPage(page);
    await personaList.goto();

    // Create.
    await personaList.createPersona(
      'DevOps Engineer',
      'Manages CI/CD pipelines and infrastructure',
    );
    await personaList.expectPersonaInList('DevOps Engineer');

    // Update.
    await personaList.editPersona(
      'DevOps Engineer',
      'Platform Engineer',
      'Builds and maintains developer platforms',
    );
    await personaList.expectPersonaInList('Platform Engineer');
    await personaList.expectPersonaNotInList('DevOps Engineer');

    // Delete (no task references, so deletion should succeed).
    const deleted = await personaList.deletePersona('Platform Engineer');
    expect(deleted).toBe(true);
    await personaList.expectPersonaNotInList('Platform Engineer');
  });
});
