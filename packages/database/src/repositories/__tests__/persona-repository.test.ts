/**
 * Integration tests for PersonaRepository.
 *
 * Covers:
 * - CRUD operations
 * - Deletion guard (prevent delete when active tasks reference persona)
 * - Name uniqueness per project
 * - Tenant isolation
 *
 * Note: PersonaRepository is a standalone repository (not extending base).
 * Personas use physical deletion (not soft-delete) and have no version
 * column (no optimistic locking).
 */

import { describe, it, expect } from 'vitest';

import { ValidationError } from '../base-repository';
import { createEpicRepository } from '../epic-repository';
import { createPersonaRepository } from '../persona-repository';
import { createProjectRepository } from '../project-repository';
import { createStoryRepository } from '../story-repository';
import { createTaskRepository } from '../task-repository';

import {
  seedTenant,
  makePersonaData,
  makeProjectData,
  makeEpicData,
  makeStoryData,
  makeTaskData,
} from './fixtures';
import { HAS_DATABASE, getTestDb, setupTestTransaction } from './setup';

describe.skipIf(!HAS_DATABASE)('PersonaRepository', () => {
  setupTestTransaction();

  const getRepos = () => ({
    personaRepo: createPersonaRepository(getTestDb()),
    taskRepo: createTaskRepository(getTestDb()),
    storyRepo: createStoryRepository(getTestDb()),
    epicRepo: createEpicRepository(getTestDb()),
    projectRepo: createProjectRepository(getTestDb()),
  });

  /** Helper: seeds a full hierarchy for tasks that reference a persona */
  const seedTaskContext = async () => {
    const tenantId = await seedTenant(getTestDb());
    const { projectRepo, epicRepo, storyRepo } = getRepos();
    const project = await projectRepo.create(tenantId, makeProjectData());
    const epic = await epicRepo.create(tenantId, project.id, makeEpicData());
    const story = await storyRepo.create(tenantId, epic.id, makeStoryData());
    return { tenantId, projectId: project.id, epicId: epic.id, storyId: story.id };
  };

  // -----------------------------------------------------------------------
  // CRUD operations
  // -----------------------------------------------------------------------

  describe('CRUD operations', () => {
    it('should create a persona', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { personaRepo } = getRepos();
      const data = makePersonaData();

      const persona = await personaRepo.create(tenantId, data);

      expect(persona).toBeDefined();
      expect(persona.id).toBeDefined();
      expect(persona.tenantId).toBe(tenantId);
      expect(persona.name).toBe(data.name);
      expect(persona.description).toBe(data.description);
    });

    it('should find a persona by ID', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { personaRepo } = getRepos();
      const created = await personaRepo.create(tenantId, makePersonaData());

      const found = await personaRepo.findById(tenantId, created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('should return null for a nonexistent persona', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { personaRepo } = getRepos();
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const found = await personaRepo.findById(tenantId, fakeId);
      expect(found).toBeNull();
    });

    it('should update a persona', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { personaRepo } = getRepos();
      const persona = await personaRepo.create(tenantId, makePersonaData());

      const updated = await personaRepo.update(tenantId, persona.id, {
        name: 'Updated Persona Name',
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated Persona Name');
    });

    it('should return null when updating a nonexistent persona', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { personaRepo } = getRepos();
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const updated = await personaRepo.update(tenantId, fakeId, { name: 'New Name' });
      expect(updated).toBeNull();
    });

    it('should physically delete a persona with no active task references', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { personaRepo } = getRepos();
      const persona = await personaRepo.create(tenantId, makePersonaData());

      // eslint-disable-next-line drizzle/enforce-delete-with-where -- repository method, not raw Drizzle
      await personaRepo.delete(tenantId, persona.id);

      const found = await personaRepo.findById(tenantId, persona.id);
      expect(found).toBeNull();
    });

    it('should list personas by tenant with pagination', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { personaRepo } = getRepos();

      await personaRepo.create(tenantId, makePersonaData());
      await personaRepo.create(tenantId, makePersonaData());
      await personaRepo.create(tenantId, makePersonaData());

      const result = await personaRepo.findByTenant(tenantId, {
        pagination: { page: 1, limit: 2, sortBy: 'createdAt', sortOrder: 'asc' },
      });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(3);
      expect(result.pagination.hasNext).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Deletion guard
  // -----------------------------------------------------------------------

  describe('deletion guard', () => {
    it('should prevent deletion when active tasks reference the persona', async () => {
      const { tenantId, storyId } = await seedTaskContext();
      const { personaRepo, taskRepo } = getRepos();

      // Create a persona and a task that references it
      const persona = await personaRepo.create(tenantId, makePersonaData());
      await taskRepo.create(tenantId, storyId, makeTaskData({ personaId: persona.id }));

      // Task is 'pending' (non-terminal) -> deletion should be blocked
      // eslint-disable-next-line drizzle/enforce-delete-with-where -- repository method, not raw Drizzle
      await expect(personaRepo.delete(tenantId, persona.id)).rejects.toThrow(ValidationError);
    });

    it('should allow deletion when all referencing tasks are in terminal state', async () => {
      const { tenantId, storyId } = await seedTaskContext();
      const { personaRepo, taskRepo } = getRepos();

      const persona = await personaRepo.create(tenantId, makePersonaData());
      const task = await taskRepo.create(
        tenantId,
        storyId,
        makeTaskData({ personaId: persona.id }),
      );

      // Move task to terminal 'done' status
      await taskRepo.update(tenantId, task.id, { workStatus: 'done' }, task.version);

      // Deletion should succeed since all tasks are terminal
      // eslint-disable-next-line drizzle/enforce-delete-with-where -- repository method, not raw Drizzle
      await personaRepo.delete(tenantId, persona.id);

      const found = await personaRepo.findById(tenantId, persona.id);
      expect(found).toBeNull();
    });

    it('should allow deletion when referencing tasks are soft-deleted', async () => {
      const { tenantId, storyId } = await seedTaskContext();
      const { personaRepo, taskRepo } = getRepos();

      const persona = await personaRepo.create(tenantId, makePersonaData());
      const task = await taskRepo.create(
        tenantId,
        storyId,
        makeTaskData({ personaId: persona.id }),
      );

      // Soft-delete the task (pending but deleted -> not blocking)
      await taskRepo.softDelete(tenantId, task.id);

      // eslint-disable-next-line drizzle/enforce-delete-with-where -- repository method, not raw Drizzle
      await personaRepo.delete(tenantId, persona.id);

      const found = await personaRepo.findById(tenantId, persona.id);
      expect(found).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Name uniqueness per project
  // -----------------------------------------------------------------------

  describe('name uniqueness per project', () => {
    it('should prevent duplicate names within the same project', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { personaRepo } = getRepos();

      const name = `Unique Persona ${String(Date.now())}`;
      await personaRepo.create(tenantId, makePersonaData({ name }));

      await expect(personaRepo.create(tenantId, makePersonaData({ name }))).rejects.toThrow(
        ValidationError,
      );
    });

    it('should allow the same name in different tenants', async () => {
      const tenantA = await seedTenant(getTestDb());
      const tenantB = await seedTenant(getTestDb());
      const { personaRepo } = getRepos();

      const name = `Shared Persona Name ${String(Date.now())}`;

      const personaA = await personaRepo.create(tenantA, makePersonaData({ name }));
      const personaB = await personaRepo.create(tenantB, makePersonaData({ name }));

      expect(personaA.name).toBe(name);
      expect(personaB.name).toBe(name);
      expect(personaA.tenantId).not.toBe(personaB.tenantId);
    });

    it('should throw ValidationError when updating to a duplicate name', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { personaRepo } = getRepos();

      const name1 = `Persona One ${String(Date.now())}`;
      const name2 = `Persona Two ${String(Date.now())}`;

      await personaRepo.create(tenantId, makePersonaData({ name: name1 }));
      const persona2 = await personaRepo.create(tenantId, makePersonaData({ name: name2 }));

      // Trying to update persona2's name to persona1's name
      await expect(personaRepo.update(tenantId, persona2.id, { name: name1 })).rejects.toThrow(
        ValidationError,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Tenant isolation
  // -----------------------------------------------------------------------

  describe('tenant isolation', () => {
    it('should not return personas belonging to another tenant', async () => {
      const tenantA = await seedTenant(getTestDb());
      const tenantB = await seedTenant(getTestDb());
      const { personaRepo } = getRepos();

      const persona = await personaRepo.create(tenantA, makePersonaData());

      const found = await personaRepo.findById(tenantB, persona.id);
      expect(found).toBeNull();
    });

    it('should not list personas across tenants', async () => {
      const tenantA = await seedTenant(getTestDb());
      const tenantB = await seedTenant(getTestDb());
      const { personaRepo } = getRepos();

      await personaRepo.create(tenantA, makePersonaData());
      await personaRepo.create(tenantB, makePersonaData());

      const resultA = await personaRepo.findByTenant(tenantA);
      const resultB = await personaRepo.findByTenant(tenantB);

      expect(resultA.data).toHaveLength(1);
      expect(resultA.data[0]!.tenantId).toBe(tenantA);
      expect(resultB.data).toHaveLength(1);
      expect(resultB.data[0]!.tenantId).toBe(tenantB);
    });
  });
});
