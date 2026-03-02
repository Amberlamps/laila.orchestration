/**
 * Integration tests for ProjectRepository.
 *
 * Covers:
 * - CRUD operations (create, read, update, soft-delete)
 * - Lifecycle status transition validation (valid and invalid)
 * - Optimistic locking conflict detection
 * - Pagination with filters
 * - Tenant isolation (cross-tenant queries return empty results)
 */

import { describe, it, expect } from 'vitest';

import { ConflictError, NotFoundError, ValidationError } from '../base-repository';
import { createProjectRepository } from '../project-repository';

import { seedTenant, makeProjectData } from './fixtures';
import { HAS_DATABASE, getTestDb, setupTestTransaction } from './setup';

describe.skipIf(!HAS_DATABASE)('ProjectRepository', () => {
  setupTestTransaction();

  const getRepo = () => createProjectRepository(getTestDb());

  // -----------------------------------------------------------------------
  // CRUD operations
  // -----------------------------------------------------------------------

  describe('CRUD operations', () => {
    it('should create a project with default lifecycle and work status', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();
      const data = makeProjectData();

      const project = await repo.create(tenantId, data);

      expect(project).toBeDefined();
      expect(project.id).toBeDefined();
      expect(project.tenantId).toBe(tenantId);
      expect(project.name).toBe(data.name);
      expect(project.description).toBe(data.description);
      expect(project.lifecycleStatus).toBe('draft');
      expect(project.workStatus).toBe('pending');
      expect(project.version).toBe(0);
      expect(project.deletedAt).toBeNull();
    });

    it('should find a project by ID within the correct tenant', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();
      const created = await repo.create(tenantId, makeProjectData());

      const found = await repo.findById(tenantId, created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe(created.name);
    });

    it('should return null when project does not exist', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const found = await repo.findById(tenantId, fakeId);

      expect(found).toBeNull();
    });

    it('should update a project with correct version', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();
      const project = await repo.create(tenantId, makeProjectData());

      const updated = await repo.update(
        tenantId,
        project.id,
        { name: 'Updated Name' },
        project.version,
      );

      expect(updated.name).toBe('Updated Name');
      expect(updated.version).toBe(project.version + 1);
    });

    it('should soft-delete a project', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();
      const project = await repo.create(tenantId, makeProjectData());

      const deleted = await repo.softDelete(tenantId, project.id);

      expect(deleted).toBeDefined();
      expect(deleted.deletedAt).not.toBeNull();

      // Should not be found after soft-delete
      const found = await repo.findById(tenantId, project.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundError when soft-deleting a nonexistent project', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(repo.softDelete(tenantId, fakeId)).rejects.toThrow(NotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // Lifecycle status transitions
  // -----------------------------------------------------------------------

  describe('lifecycle status transitions', () => {
    it('should allow valid transitions: draft -> planning -> ready -> active -> completed', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();
      let project = await repo.create(tenantId, makeProjectData());

      // draft -> planning
      project = await repo.update(
        tenantId,
        project.id,
        { lifecycleStatus: 'planning' },
        project.version,
      );
      expect(project.lifecycleStatus).toBe('planning');

      // planning -> ready
      project = await repo.update(
        tenantId,
        project.id,
        { lifecycleStatus: 'ready' },
        project.version,
      );
      expect(project.lifecycleStatus).toBe('ready');

      // ready -> active
      project = await repo.update(
        tenantId,
        project.id,
        { lifecycleStatus: 'active' },
        project.version,
      );
      expect(project.lifecycleStatus).toBe('active');

      // active -> completed
      project = await repo.update(
        tenantId,
        project.id,
        { lifecycleStatus: 'completed' },
        project.version,
      );
      expect(project.lifecycleStatus).toBe('completed');
    });

    it('should allow transition to archived from any non-terminal state', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();
      const project = await repo.create(tenantId, makeProjectData());

      // draft -> archived
      const archived = await repo.update(
        tenantId,
        project.id,
        { lifecycleStatus: 'archived' },
        project.version,
      );
      expect(archived.lifecycleStatus).toBe('archived');
    });

    it('should reject invalid lifecycle transitions', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();
      const project = await repo.create(tenantId, makeProjectData());

      // draft -> active (skipping planning and ready) is invalid
      await expect(
        repo.update(tenantId, project.id, { lifecycleStatus: 'active' }, project.version),
      ).rejects.toThrow(ValidationError);
    });

    it('should reject transitions from archived (terminal state)', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();
      let project = await repo.create(tenantId, makeProjectData());
      project = await repo.update(
        tenantId,
        project.id,
        { lifecycleStatus: 'archived' },
        project.version,
      );

      await expect(
        repo.update(tenantId, project.id, { lifecycleStatus: 'draft' }, project.version),
      ).rejects.toThrow(ValidationError);
    });
  });

  // -----------------------------------------------------------------------
  // Optimistic locking
  // -----------------------------------------------------------------------

  describe('optimistic locking', () => {
    it('should throw ConflictError when version does not match', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();
      const project = await repo.create(tenantId, makeProjectData());

      // First update succeeds
      await repo.update(tenantId, project.id, { name: 'Update 1' }, project.version);

      // Second update with stale version should fail
      await expect(
        repo.update(tenantId, project.id, { name: 'Update 2' }, project.version),
      ).rejects.toThrow(ConflictError);
    });

    it('should succeed when using the latest version', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();
      const project = await repo.create(tenantId, makeProjectData());

      const updated1 = await repo.update(
        tenantId,
        project.id,
        { name: 'Update 1' },
        project.version,
      );
      const updated2 = await repo.update(
        tenantId,
        project.id,
        { name: 'Update 2' },
        updated1.version,
      );

      expect(updated2.name).toBe('Update 2');
      expect(updated2.version).toBe(project.version + 2);
    });
  });

  // -----------------------------------------------------------------------
  // Pagination with filters
  // -----------------------------------------------------------------------

  describe('pagination with filters', () => {
    it('should return paginated results', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();

      // Create 5 projects
      for (let i = 0; i < 5; i++) {
        await repo.create(tenantId, makeProjectData({ name: `Project ${String(i)}` }));
      }

      const result = await repo.findByTenant(tenantId, {
        pagination: { page: 1, limit: 3, sortBy: 'createdAt', sortOrder: 'asc' },
      });

      expect(result.data).toHaveLength(3);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.totalPages).toBe(2);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(false);
    });

    it('should filter by lifecycle status', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();

      const p1 = await repo.create(tenantId, makeProjectData());
      await repo.create(tenantId, makeProjectData());
      // Transition p1 to planning
      await repo.update(tenantId, p1.id, { lifecycleStatus: 'planning' }, p1.version);

      const result = await repo.findByTenant(tenantId, {
        lifecycleStatus: 'planning',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.lifecycleStatus).toBe('planning');
    });

    it('should return empty results for no matching filter', async () => {
      const tenantId = await seedTenant(getTestDb());
      const repo = getRepo();
      await repo.create(tenantId, makeProjectData());

      const result = await repo.findByTenant(tenantId, {
        lifecycleStatus: 'completed',
      });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Tenant isolation
  // -----------------------------------------------------------------------

  describe('tenant isolation', () => {
    it('should not return projects belonging to another tenant', async () => {
      const tenantA = await seedTenant(getTestDb());
      const tenantB = await seedTenant(getTestDb());
      const repo = getRepo();

      // Create project for tenant A
      const projectA = await repo.create(tenantA, makeProjectData({ name: 'Tenant A Project' }));

      // Tenant B should not see tenant A's project
      const found = await repo.findById(tenantB, projectA.id);
      expect(found).toBeNull();
    });

    it('should not list projects across tenants', async () => {
      const tenantA = await seedTenant(getTestDb());
      const tenantB = await seedTenant(getTestDb());
      const repo = getRepo();

      await repo.create(tenantA, makeProjectData({ name: 'Tenant A Project' }));
      await repo.create(tenantB, makeProjectData({ name: 'Tenant B Project' }));

      const resultA = await repo.findByTenant(tenantA);
      const resultB = await repo.findByTenant(tenantB);

      expect(resultA.data).toHaveLength(1);
      expect(resultA.data[0]!.name).toBe('Tenant A Project');
      expect(resultB.data).toHaveLength(1);
      expect(resultB.data[0]!.name).toBe('Tenant B Project');
    });

    it('should not allow updating a project belonging to another tenant', async () => {
      const tenantA = await seedTenant(getTestDb());
      const tenantB = await seedTenant(getTestDb());
      const repo = getRepo();

      const projectA = await repo.create(tenantA, makeProjectData());

      // Tenant B tries to update tenant A's project -> ConflictError (no rows match)
      await expect(
        repo.update(tenantB, projectA.id, { name: 'Hijacked' }, projectA.version),
      ).rejects.toThrow(ConflictError);
    });
  });
});
