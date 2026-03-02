/**
 * Integration tests for EpicRepository.
 *
 * Covers:
 * - CRUD operations with project association
 * - Derived status computation from child stories
 * - Reorder operations
 * - Tenant isolation
 */

import { describe, it, expect } from 'vitest';

import { ConflictError, NotFoundError, ValidationError } from '../base-repository';
import { createEpicRepository } from '../epic-repository';
import { createProjectRepository } from '../project-repository';
import { createStoryRepository } from '../story-repository';

import { seedTenant, makeProjectData, makeEpicData, makeStoryData } from './fixtures';
import { HAS_DATABASE, getTestDb, setupTestTransaction } from './setup';

describe.skipIf(!HAS_DATABASE)('EpicRepository', () => {
  setupTestTransaction();

  const getRepos = () => ({
    epicRepo: createEpicRepository(getTestDb()),
    projectRepo: createProjectRepository(getTestDb()),
    storyRepo: createStoryRepository(getTestDb()),
  });

  /** Helper: creates a tenant and project, returns both IDs */
  const seedProjectContext = async () => {
    const tenantId = await seedTenant(getTestDb());
    const { projectRepo } = getRepos();
    const project = await projectRepo.create(tenantId, makeProjectData());
    return { tenantId, projectId: project.id };
  };

  // -----------------------------------------------------------------------
  // CRUD operations
  // -----------------------------------------------------------------------

  describe('CRUD operations', () => {
    it('should create an epic with correct defaults and project association', async () => {
      const { tenantId, projectId } = await seedProjectContext();
      const { epicRepo } = getRepos();
      const data = makeEpicData();

      const epic = await epicRepo.create(tenantId, projectId, data);

      expect(epic).toBeDefined();
      expect(epic.id).toBeDefined();
      expect(epic.tenantId).toBe(tenantId);
      expect(epic.projectId).toBe(projectId);
      expect(epic.name).toBe(data.name);
      expect(epic.workStatus).toBe('pending');
      expect(epic.sortOrder).toBe(0);
      expect(epic.version).toBe(0);
    });

    it('should auto-increment sort order for new epics in the same project', async () => {
      const { tenantId, projectId } = await seedProjectContext();
      const { epicRepo } = getRepos();

      const epic1 = await epicRepo.create(tenantId, projectId, makeEpicData());
      const epic2 = await epicRepo.create(tenantId, projectId, makeEpicData());
      const epic3 = await epicRepo.create(tenantId, projectId, makeEpicData());

      expect(epic1.sortOrder).toBe(0);
      expect(epic2.sortOrder).toBe(1);
      expect(epic3.sortOrder).toBe(2);
    });

    it('should find an epic by ID within the correct tenant', async () => {
      const { tenantId, projectId } = await seedProjectContext();
      const { epicRepo } = getRepos();
      const created = await epicRepo.create(tenantId, projectId, makeEpicData());

      const found = await epicRepo.findById(tenantId, created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('should update an epic with optimistic locking', async () => {
      const { tenantId, projectId } = await seedProjectContext();
      const { epicRepo } = getRepos();
      const epic = await epicRepo.create(tenantId, projectId, makeEpicData());

      const updated = await epicRepo.update(
        tenantId,
        epic.id,
        { name: 'Updated Epic Name' },
        epic.version,
      );

      expect(updated.name).toBe('Updated Epic Name');
      expect(updated.version).toBe(epic.version + 1);
    });

    it('should throw ConflictError on version mismatch', async () => {
      const { tenantId, projectId } = await seedProjectContext();
      const { epicRepo } = getRepos();
      const epic = await epicRepo.create(tenantId, projectId, makeEpicData());

      await epicRepo.update(tenantId, epic.id, { name: 'First Update' }, epic.version);

      await expect(
        epicRepo.update(tenantId, epic.id, { name: 'Stale Update' }, epic.version),
      ).rejects.toThrow(ConflictError);
    });

    it('should reject empty name on create', async () => {
      const { tenantId, projectId } = await seedProjectContext();
      const { epicRepo } = getRepos();

      await expect(
        epicRepo.create(tenantId, projectId, { name: '', description: null }),
      ).rejects.toThrow(ValidationError);
    });

    it('should reject empty name on update', async () => {
      const { tenantId, projectId } = await seedProjectContext();
      const { epicRepo } = getRepos();
      const epic = await epicRepo.create(tenantId, projectId, makeEpicData());

      await expect(epicRepo.update(tenantId, epic.id, { name: '' }, epic.version)).rejects.toThrow(
        ValidationError,
      );
    });

    it('should soft-delete an epic', async () => {
      const { tenantId, projectId } = await seedProjectContext();
      const { epicRepo } = getRepos();
      const epic = await epicRepo.create(tenantId, projectId, makeEpicData());

      const deleted = await epicRepo.softDelete(tenantId, epic.id);

      expect(deleted).not.toBeNull();
      expect(deleted!.deletedAt).not.toBeNull();

      const found = await epicRepo.findById(tenantId, epic.id);
      expect(found).toBeNull();
    });

    it('should list epics by project ordered by sort_order', async () => {
      const { tenantId, projectId } = await seedProjectContext();
      const { epicRepo } = getRepos();

      await epicRepo.create(tenantId, projectId, makeEpicData({ name: 'Epic A' }));
      await epicRepo.create(tenantId, projectId, makeEpicData({ name: 'Epic B' }));
      await epicRepo.create(tenantId, projectId, makeEpicData({ name: 'Epic C' }));

      const result = await epicRepo.findByProject(tenantId, projectId);

      expect(result.data).toHaveLength(3);
      expect(result.data[0]!.sortOrder).toBe(0);
      expect(result.data[1]!.sortOrder).toBe(1);
      expect(result.data[2]!.sortOrder).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Derived status computation
  // -----------------------------------------------------------------------

  describe('derived status computation', () => {
    it('should return pending when epic has no stories', async () => {
      const { tenantId, projectId } = await seedProjectContext();
      const { epicRepo } = getRepos();
      const epic = await epicRepo.create(tenantId, projectId, makeEpicData());

      const status = await epicRepo.computeDerivedStatus(tenantId, epic.id);

      expect(status).toBe('pending');
    });

    it('should return pending when all stories are pending', async () => {
      const { tenantId, projectId } = await seedProjectContext();
      const { epicRepo, storyRepo } = getRepos();
      const epic = await epicRepo.create(tenantId, projectId, makeEpicData());

      await storyRepo.create(tenantId, epic.id, makeStoryData());
      await storyRepo.create(tenantId, epic.id, makeStoryData());

      const status = await epicRepo.computeDerivedStatus(tenantId, epic.id);

      expect(status).toBe('pending');
    });

    it('should throw NotFoundError for nonexistent epic', async () => {
      const { tenantId } = await seedProjectContext();
      const { epicRepo } = getRepos();
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(epicRepo.computeDerivedStatus(tenantId, fakeId)).rejects.toThrow(NotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // Reorder operations
  // -----------------------------------------------------------------------

  describe('reorder operations', () => {
    it('should reorder epics within a project', async () => {
      const { tenantId, projectId } = await seedProjectContext();
      const { epicRepo } = getRepos();

      const epicA = await epicRepo.create(tenantId, projectId, makeEpicData({ name: 'A' }));
      const epicB = await epicRepo.create(tenantId, projectId, makeEpicData({ name: 'B' }));
      const epicC = await epicRepo.create(tenantId, projectId, makeEpicData({ name: 'C' }));

      // Reverse the order: C, B, A
      await epicRepo.reorder(tenantId, [epicC.id, epicB.id, epicA.id]);

      const result = await epicRepo.findByProject(tenantId, projectId);
      expect(result.data[0]!.id).toBe(epicC.id);
      expect(result.data[0]!.sortOrder).toBe(0);
      expect(result.data[1]!.id).toBe(epicB.id);
      expect(result.data[1]!.sortOrder).toBe(1);
      expect(result.data[2]!.id).toBe(epicA.id);
      expect(result.data[2]!.sortOrder).toBe(2);
    });

    it('should throw ValidationError for empty epicIds array', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { epicRepo } = getRepos();

      await expect(epicRepo.reorder(tenantId, [])).rejects.toThrow(ValidationError);
    });
  });

  // -----------------------------------------------------------------------
  // Tenant isolation
  // -----------------------------------------------------------------------

  describe('tenant isolation', () => {
    it('should not return epics belonging to another tenant', async () => {
      const tenantA = await seedTenant(getTestDb());
      const tenantB = await seedTenant(getTestDb());
      const { epicRepo, projectRepo } = getRepos();

      const projectA = await projectRepo.create(tenantA, makeProjectData());
      const epicA = await epicRepo.create(tenantA, projectA.id, makeEpicData());

      // Tenant B cannot see tenant A's epic
      const found = await epicRepo.findById(tenantB, epicA.id);
      expect(found).toBeNull();
    });

    it('should not list epics from another tenant when querying by project', async () => {
      const tenantA = await seedTenant(getTestDb());
      const tenantB = await seedTenant(getTestDb());
      const { epicRepo, projectRepo } = getRepos();

      const projectA = await projectRepo.create(tenantA, makeProjectData());
      await epicRepo.create(tenantA, projectA.id, makeEpicData());

      // Tenant B querying the same project ID should get empty results
      const result = await epicRepo.findByProject(tenantB, projectA.id);
      expect(result.data).toHaveLength(0);
    });
  });
});
