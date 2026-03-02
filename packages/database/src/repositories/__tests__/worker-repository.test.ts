/**
 * Integration tests for WorkerRepository.
 *
 * Covers:
 * - Create with API key generation
 * - Authenticate by API key (valid and invalid keys)
 * - API key regeneration
 * - Project access grant/revoke
 * - Activate/deactivate
 * - Tenant isolation
 *
 * Note: WorkerRepository is a standalone repository (not extending base)
 * and uses `updatedAt` timestamp for optimistic locking instead of a
 * version column.
 */

import { describe, it, expect } from 'vitest';

import { ConflictError, NotFoundError } from '../base-repository';
import { createProjectRepository } from '../project-repository';
import { createWorkerRepository } from '../worker-repository';

import { seedTenant, makeWorkerData, makeProjectData } from './fixtures';
import { HAS_DATABASE, getTestDb, setupTestTransaction } from './setup';

describe.skipIf(!HAS_DATABASE)('WorkerRepository', () => {
  setupTestTransaction();

  const getRepos = () => ({
    workerRepo: createWorkerRepository(getTestDb()),
    projectRepo: createProjectRepository(getTestDb()),
  });

  // -----------------------------------------------------------------------
  // Create with API key generation
  // -----------------------------------------------------------------------

  describe('create with API key generation', () => {
    it('should create a worker and return the raw API key', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();
      const data = makeWorkerData();

      const result = await workerRepo.create(tenantId, data);

      expect(result.worker).toBeDefined();
      expect(result.worker.id).toBeDefined();
      expect(result.worker.tenantId).toBe(tenantId);
      expect(result.worker.name).toBe(data.name);
      expect(result.worker.isActive).toBe(true);
      expect(result.worker.apiKeyHash).toBeDefined();
      expect(result.worker.apiKeyPrefix).toBeDefined();

      // Raw API key should be returned and start with 'lw_'
      expect(result.rawApiKey).toBeDefined();
      expect(result.rawApiKey.startsWith('lw_')).toBe(true);
    });

    it('should store a hashed API key, not the raw key', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();

      const { worker, rawApiKey } = await workerRepo.create(tenantId, makeWorkerData());

      // The stored hash should NOT equal the raw key
      expect(worker.apiKeyHash).not.toBe(rawApiKey);
      // The prefix should be a substring of the raw key
      expect(rawApiKey.startsWith(worker.apiKeyPrefix)).toBe(true);
    });

    it('should find a worker by ID', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();

      const { worker } = await workerRepo.create(tenantId, makeWorkerData());
      const found = await workerRepo.findById(tenantId, worker.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(worker.id);
    });
  });

  // -----------------------------------------------------------------------
  // Authenticate by API key
  // -----------------------------------------------------------------------

  describe('authenticate by API key', () => {
    it('should authenticate with a valid API key (no tenantId required)', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();

      const { worker, rawApiKey } = await workerRepo.create(tenantId, makeWorkerData());

      // authenticateByApiKey does NOT require tenantId
      const authenticated = await workerRepo.authenticateByApiKey(rawApiKey);

      expect(authenticated).not.toBeNull();
      expect(authenticated!.id).toBe(worker.id);
      expect(authenticated!.tenantId).toBe(tenantId);
    });

    it('should return null for an invalid API key', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();

      await workerRepo.create(tenantId, makeWorkerData());

      const authenticated = await workerRepo.authenticateByApiKey(
        'lw_invalid_key_that_does_not_exist',
      );
      expect(authenticated).toBeNull();
    });

    it('should return null for a deactivated worker', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();

      const { worker, rawApiKey } = await workerRepo.create(tenantId, makeWorkerData());

      // Deactivate the worker
      await workerRepo.deactivate(tenantId, worker.id, worker.updatedAt);

      // Should not authenticate
      const authenticated = await workerRepo.authenticateByApiKey(rawApiKey);
      expect(authenticated).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // API key regeneration
  // -----------------------------------------------------------------------

  describe('API key regeneration', () => {
    it('should regenerate API key and invalidate the old one', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();

      const { worker, rawApiKey: oldKey } = await workerRepo.create(tenantId, makeWorkerData());

      // Regenerate
      const { worker: updatedWorker, rawApiKey: newKey } = await workerRepo.regenerateApiKey(
        tenantId,
        worker.id,
        worker.updatedAt,
      );

      expect(newKey).toBeDefined();
      expect(newKey).not.toBe(oldKey);
      expect(updatedWorker.apiKeyHash).not.toBe(worker.apiKeyHash);

      // Old key should no longer work
      const authOld = await workerRepo.authenticateByApiKey(oldKey);
      expect(authOld).toBeNull();

      // New key should work
      const authNew = await workerRepo.authenticateByApiKey(newKey);
      expect(authNew).not.toBeNull();
      expect(authNew!.id).toBe(worker.id);
    });

    it('should throw ConflictError when using stale updatedAt for regeneration', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();

      const { worker } = await workerRepo.create(tenantId, makeWorkerData());
      const staleVersion = worker.updatedAt;

      // First regeneration succeeds
      await workerRepo.regenerateApiKey(tenantId, worker.id, staleVersion);

      // Second regeneration with stale version fails
      await expect(workerRepo.regenerateApiKey(tenantId, worker.id, staleVersion)).rejects.toThrow(
        ConflictError,
      );
    });

    it('should throw NotFoundError when regenerating key for nonexistent worker', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(workerRepo.regenerateApiKey(tenantId, fakeId, new Date())).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Project access management
  // -----------------------------------------------------------------------

  describe('project access', () => {
    it('should grant and check project access', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo, projectRepo } = getRepos();

      const { worker } = await workerRepo.create(tenantId, makeWorkerData());
      const project = await projectRepo.create(tenantId, makeProjectData());

      await workerRepo.grantProjectAccess(tenantId, worker.id, project.id);

      const hasAccess = await workerRepo.hasProjectAccess(tenantId, worker.id, project.id);
      expect(hasAccess).toBe(true);
    });

    it('should return false for ungranted project access', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo, projectRepo } = getRepos();

      const { worker } = await workerRepo.create(tenantId, makeWorkerData());
      const project = await projectRepo.create(tenantId, makeProjectData());

      const hasAccess = await workerRepo.hasProjectAccess(tenantId, worker.id, project.id);
      expect(hasAccess).toBe(false);
    });

    it('should revoke project access', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo, projectRepo } = getRepos();

      const { worker } = await workerRepo.create(tenantId, makeWorkerData());
      const project = await projectRepo.create(tenantId, makeProjectData());

      await workerRepo.grantProjectAccess(tenantId, worker.id, project.id);
      const revoked = await workerRepo.revokeProjectAccess(tenantId, worker.id, project.id);

      expect(revoked).not.toBeNull();

      const hasAccess = await workerRepo.hasProjectAccess(tenantId, worker.id, project.id);
      expect(hasAccess).toBe(false);
    });

    it('should return null when revoking nonexistent access', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo, projectRepo } = getRepos();

      const { worker } = await workerRepo.create(tenantId, makeWorkerData());
      const project = await projectRepo.create(tenantId, makeProjectData());

      const revoked = await workerRepo.revokeProjectAccess(tenantId, worker.id, project.id);
      expect(revoked).toBeNull();
    });

    it('should list all project access for a worker', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo, projectRepo } = getRepos();

      const { worker } = await workerRepo.create(tenantId, makeWorkerData());
      const project1 = await projectRepo.create(tenantId, makeProjectData());
      const project2 = await projectRepo.create(tenantId, makeProjectData());

      await workerRepo.grantProjectAccess(tenantId, worker.id, project1.id);
      await workerRepo.grantProjectAccess(tenantId, worker.id, project2.id);

      const accessList = await workerRepo.getProjectAccess(tenantId, worker.id);

      expect(accessList).toHaveLength(2);
      const projectIds = accessList.map((a) => a.projectId);
      expect(projectIds).toContain(project1.id);
      expect(projectIds).toContain(project2.id);
    });
  });

  // -----------------------------------------------------------------------
  // Activate / deactivate
  // -----------------------------------------------------------------------

  describe('activate and deactivate', () => {
    it('should deactivate a worker', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();

      const { worker } = await workerRepo.create(tenantId, makeWorkerData());

      const deactivated = await workerRepo.deactivate(tenantId, worker.id, worker.updatedAt);

      expect(deactivated.isActive).toBe(false);
    });

    it('should activate a previously deactivated worker', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();

      const { worker } = await workerRepo.create(tenantId, makeWorkerData());
      const deactivated = await workerRepo.deactivate(tenantId, worker.id, worker.updatedAt);
      const activated = await workerRepo.activate(tenantId, worker.id, deactivated.updatedAt);

      expect(activated.isActive).toBe(true);
    });

    it('should throw ConflictError when deactivating with stale updatedAt', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();

      const { worker } = await workerRepo.create(tenantId, makeWorkerData());
      const staleVersion = worker.updatedAt;

      // First deactivate succeeds
      await workerRepo.deactivate(tenantId, worker.id, staleVersion);

      // Second deactivate with stale version fails
      await expect(workerRepo.deactivate(tenantId, worker.id, staleVersion)).rejects.toThrow(
        ConflictError,
      );
    });

    it('should throw NotFoundError when deactivating nonexistent worker', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(workerRepo.deactivate(tenantId, fakeId, new Date())).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Tenant isolation
  // -----------------------------------------------------------------------

  describe('tenant isolation', () => {
    it('should not return workers belonging to another tenant', async () => {
      const tenantA = await seedTenant(getTestDb());
      const tenantB = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();

      const { worker: workerA } = await workerRepo.create(tenantA, makeWorkerData());

      const found = await workerRepo.findById(tenantB, workerA.id);
      expect(found).toBeNull();
    });

    it('should not list workers across tenants', async () => {
      const tenantA = await seedTenant(getTestDb());
      const tenantB = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();

      await workerRepo.create(tenantA, makeWorkerData());
      await workerRepo.create(tenantB, makeWorkerData());

      const resultA = await workerRepo.findByTenant(tenantA);
      const resultB = await workerRepo.findByTenant(tenantB);

      expect(resultA.data).toHaveLength(1);
      expect(resultB.data).toHaveLength(1);
      expect(resultA.data[0]!.tenantId).toBe(tenantA);
      expect(resultB.data[0]!.tenantId).toBe(tenantB);
    });

    it('should not allow deactivating a worker belonging to another tenant', async () => {
      const tenantA = await seedTenant(getTestDb());
      const tenantB = await seedTenant(getTestDb());
      const { workerRepo } = getRepos();

      const { worker } = await workerRepo.create(tenantA, makeWorkerData());

      await expect(workerRepo.deactivate(tenantB, worker.id, worker.updatedAt)).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
