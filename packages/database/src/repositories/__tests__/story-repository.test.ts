/**
 * Integration tests for StoryRepository.
 *
 * Covers:
 * - CRUD operations with epic association
 * - Assignment lifecycle (assign, complete, release)
 * - Read-only enforcement during in_progress
 * - Attempt history creation during assignment
 * - Priority-ordered ready query
 * - Tenant isolation
 */

import { describe, it, expect } from 'vitest';

import { ConflictError, ValidationError } from '../base-repository';
import { createEpicRepository } from '../epic-repository';
import { createProjectRepository } from '../project-repository';
import { createStoryRepository } from '../story-repository';
import { createWorkerRepository } from '../worker-repository';

import {
  seedTenant,
  makeProjectData,
  makeEpicData,
  makeStoryData,
  makeWorkerData,
} from './fixtures';
import { HAS_DATABASE, getTestDb, setupTestTransaction } from './setup';

describe.skipIf(!HAS_DATABASE)('StoryRepository', () => {
  setupTestTransaction();

  const getRepos = () => ({
    storyRepo: createStoryRepository(getTestDb()),
    epicRepo: createEpicRepository(getTestDb()),
    projectRepo: createProjectRepository(getTestDb()),
    workerRepo: createWorkerRepository(getTestDb()),
  });

  /** Helper: creates a tenant, project, and epic, returns all IDs */
  const seedEpicContext = async () => {
    const tenantId = await seedTenant(getTestDb());
    const { projectRepo, epicRepo } = getRepos();
    const project = await projectRepo.create(tenantId, makeProjectData());
    const epic = await epicRepo.create(tenantId, project.id, makeEpicData());
    return { tenantId, projectId: project.id, epicId: epic.id };
  };

  /** Helper: creates a worker and returns its ID */
  const seedWorker = async (tenantId: string) => {
    const { workerRepo } = getRepos();
    const { worker } = await workerRepo.create(tenantId, makeWorkerData());
    return worker.id;
  };

  // -----------------------------------------------------------------------
  // CRUD operations
  // -----------------------------------------------------------------------

  describe('CRUD operations', () => {
    it('should create a story with correct defaults', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const data = makeStoryData();

      const story = await storyRepo.create(tenantId, epicId, data);

      expect(story).toBeDefined();
      expect(story.id).toBeDefined();
      expect(story.tenantId).toBe(tenantId);
      expect(story.epicId).toBe(epicId);
      expect(story.title).toBe(data.title);
      expect(story.priority).toBe('medium');
      expect(story.workStatus).toBe('pending');
      expect(story.attempts).toBe(0);
      expect(story.maxAttempts).toBe(3);
      expect(story.assignedWorkerId).toBeNull();
    });

    it('should find a story by ID', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const created = await storyRepo.create(tenantId, epicId, makeStoryData());

      const found = await storyRepo.findById(tenantId, created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('should update a story with correct version', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const story = await storyRepo.create(tenantId, epicId, makeStoryData());

      const updated = await storyRepo.update(
        tenantId,
        story.id,
        { title: 'Updated Title' },
        story.version,
      );

      expect(updated.title).toBe('Updated Title');
      expect(updated.version).toBe(story.version + 1);
    });

    it('should soft-delete a story', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const story = await storyRepo.create(tenantId, epicId, makeStoryData());

      const deleted = await storyRepo.softDelete(tenantId, story.id);
      expect(deleted).not.toBeNull();

      const found = await storyRepo.findById(tenantId, story.id);
      expect(found).toBeNull();
    });

    it('should list stories by epic', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();

      await storyRepo.create(tenantId, epicId, makeStoryData());
      await storyRepo.create(tenantId, epicId, makeStoryData());

      const result = await storyRepo.findByEpic(tenantId, epicId);

      expect(result.data).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Assignment lifecycle
  // -----------------------------------------------------------------------

  describe('assignment lifecycle', () => {
    it('should assign a worker to a ready story', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const workerId = await seedWorker(tenantId);

      // Create story, transition to ready
      let story = await storyRepo.create(tenantId, epicId, makeStoryData());
      story = await storyRepo.update(tenantId, story.id, { workStatus: 'ready' }, story.version);

      const assigned = await storyRepo.assignToWorker(tenantId, story.id, workerId, story.version);

      expect(assigned.workStatus).toBe('in_progress');
      expect(assigned.assignedWorkerId).toBe(workerId);
      expect(assigned.assignedAt).not.toBeNull();
      expect(assigned.attempts).toBe(1);
    });

    it('should complete an assignment with done status', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const workerId = await seedWorker(tenantId);

      let story = await storyRepo.create(tenantId, epicId, makeStoryData());
      story = await storyRepo.update(tenantId, story.id, { workStatus: 'ready' }, story.version);
      story = await storyRepo.assignToWorker(tenantId, story.id, workerId, story.version);

      const completed = await storyRepo.completeAssignment(
        tenantId,
        story.id,
        'done',
        '10.0000',
        null,
        story.version,
      );

      expect(completed.workStatus).toBe('done');
      expect(completed.actualCost).toBe('10.0000');
      expect(completed.assignedWorkerId).toBeNull();
      expect(completed.assignedAt).toBeNull();
    });

    it('should release an assignment and set status to ready when retries remain', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const workerId = await seedWorker(tenantId);

      let story = await storyRepo.create(tenantId, epicId, makeStoryData({ maxAttempts: 3 }));
      story = await storyRepo.update(tenantId, story.id, { workStatus: 'ready' }, story.version);
      story = await storyRepo.assignToWorker(tenantId, story.id, workerId, story.version);

      const released = await storyRepo.releaseAssignment(
        tenantId,
        story.id,
        'Worker timed out',
        story.version,
      );

      expect(released.workStatus).toBe('ready');
      expect(released.assignedWorkerId).toBeNull();
      expect(released.assignedAt).toBeNull();
    });

    it('should set status to failed when max attempts reached on release', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const workerId = await seedWorker(tenantId);

      // Create a story with maxAttempts = 1
      let story = await storyRepo.create(tenantId, epicId, makeStoryData({ maxAttempts: 1 }));
      story = await storyRepo.update(tenantId, story.id, { workStatus: 'ready' }, story.version);
      story = await storyRepo.assignToWorker(tenantId, story.id, workerId, story.version);

      const released = await storyRepo.releaseAssignment(
        tenantId,
        story.id,
        'Worker failed',
        story.version,
      );

      expect(released.workStatus).toBe('failed');
    });

    it('should throw ConflictError when assigning to non-ready story', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const workerId = await seedWorker(tenantId);

      // Story is still 'pending' (not 'ready')
      const story = await storyRepo.create(tenantId, epicId, makeStoryData());

      await expect(
        storyRepo.assignToWorker(tenantId, story.id, workerId, story.version),
      ).rejects.toThrow(ConflictError);
    });
  });

  // -----------------------------------------------------------------------
  // Read-only enforcement during in_progress
  // -----------------------------------------------------------------------

  describe('read-only enforcement during in_progress', () => {
    it('should reject title update when story is in_progress', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const workerId = await seedWorker(tenantId);

      let story = await storyRepo.create(tenantId, epicId, makeStoryData());
      story = await storyRepo.update(tenantId, story.id, { workStatus: 'ready' }, story.version);
      story = await storyRepo.assignToWorker(tenantId, story.id, workerId, story.version);

      await expect(
        storyRepo.update(tenantId, story.id, { title: 'New Title' }, story.version),
      ).rejects.toThrow(ValidationError);
    });

    it('should reject description update when story is in_progress', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const workerId = await seedWorker(tenantId);

      let story = await storyRepo.create(tenantId, epicId, makeStoryData());
      story = await storyRepo.update(tenantId, story.id, { workStatus: 'ready' }, story.version);
      story = await storyRepo.assignToWorker(tenantId, story.id, workerId, story.version);

      await expect(
        storyRepo.update(tenantId, story.id, { description: 'New Description' }, story.version),
      ).rejects.toThrow(ValidationError);
    });

    it('should reject priority update when story is in_progress', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const workerId = await seedWorker(tenantId);

      let story = await storyRepo.create(tenantId, epicId, makeStoryData());
      story = await storyRepo.update(tenantId, story.id, { workStatus: 'ready' }, story.version);
      story = await storyRepo.assignToWorker(tenantId, story.id, workerId, story.version);

      await expect(
        storyRepo.update(tenantId, story.id, { priority: 'high' }, story.version),
      ).rejects.toThrow(ValidationError);
    });

    it('should allow workStatus change even when in_progress', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const workerId = await seedWorker(tenantId);

      let story = await storyRepo.create(tenantId, epicId, makeStoryData());
      story = await storyRepo.update(tenantId, story.id, { workStatus: 'ready' }, story.version);
      story = await storyRepo.assignToWorker(tenantId, story.id, workerId, story.version);

      // workStatus is NOT in the protected fields, so this should succeed
      // (the update method only protects title, description, priority)
      const updated = await storyRepo.update(
        tenantId,
        story.id,
        { workStatus: 'done' },
        story.version,
      );
      expect(updated.workStatus).toBe('done');
    });
  });

  // -----------------------------------------------------------------------
  // Attempt history
  // -----------------------------------------------------------------------

  describe('attempt history', () => {
    it('should create an attempt history record when assigning a worker', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const workerId = await seedWorker(tenantId);

      let story = await storyRepo.create(tenantId, epicId, makeStoryData());
      story = await storyRepo.update(tenantId, story.id, { workStatus: 'ready' }, story.version);
      await storyRepo.assignToWorker(tenantId, story.id, workerId, story.version);

      const attempts = await storyRepo.getPreviousAttempts(tenantId, story.id);

      expect(attempts).toHaveLength(1);
      expect(attempts[0]!.userStoryId).toBe(story.id);
      expect(attempts[0]!.workerId).toBe(workerId);
      expect(attempts[0]!.attemptNumber).toBe(1);
      expect(attempts[0]!.status).toBe('in_progress');
      expect(attempts[0]!.startedAt).toBeDefined();
    });

    it('should update attempt history on completion', async () => {
      const { tenantId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const workerId = await seedWorker(tenantId);

      let story = await storyRepo.create(tenantId, epicId, makeStoryData());
      story = await storyRepo.update(tenantId, story.id, { workStatus: 'ready' }, story.version);
      story = await storyRepo.assignToWorker(tenantId, story.id, workerId, story.version);
      await storyRepo.completeAssignment(tenantId, story.id, 'done', '5.0000', null, story.version);

      const attempts = await storyRepo.getPreviousAttempts(tenantId, story.id);

      expect(attempts).toHaveLength(1);
      expect(attempts[0]!.status).toBe('done');
      expect(attempts[0]!.completedAt).not.toBeNull();
      expect(attempts[0]!.cost).toBe('5.0000');
    });
  });

  // -----------------------------------------------------------------------
  // Priority-ordered ready query
  // -----------------------------------------------------------------------

  describe('priority-ordered ready query', () => {
    it('should return stories ordered by priority (critical > high > medium > low)', async () => {
      const { tenantId, projectId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();

      // Create stories with different priorities
      const low = await storyRepo.create(
        tenantId,
        epicId,
        makeStoryData({ priority: 'low', title: 'Low Story' }),
      );
      const high = await storyRepo.create(
        tenantId,
        epicId,
        makeStoryData({ priority: 'high', title: 'High Story' }),
      );
      const critical = await storyRepo.create(
        tenantId,
        epicId,
        makeStoryData({ priority: 'critical', title: 'Critical Story' }),
      );
      const medium = await storyRepo.create(
        tenantId,
        epicId,
        makeStoryData({ priority: 'medium', title: 'Medium Story' }),
      );

      // Transition all to ready
      for (const s of [low, high, critical, medium]) {
        await storyRepo.update(tenantId, s.id, { workStatus: 'ready' }, s.version);
      }

      const readyStories = await storyRepo.findReadyForAssignment(tenantId, projectId);

      expect(readyStories).toHaveLength(4);
      expect(readyStories[0]!.priority).toBe('critical');
      expect(readyStories[1]!.priority).toBe('high');
      expect(readyStories[2]!.priority).toBe('medium');
      expect(readyStories[3]!.priority).toBe('low');
    });

    it('should not return assigned stories', async () => {
      const { tenantId, projectId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();
      const workerId = await seedWorker(tenantId);

      let story = await storyRepo.create(tenantId, epicId, makeStoryData());
      story = await storyRepo.update(tenantId, story.id, { workStatus: 'ready' }, story.version);
      await storyRepo.assignToWorker(tenantId, story.id, workerId, story.version);

      const readyStories = await storyRepo.findReadyForAssignment(tenantId, projectId);

      expect(readyStories).toHaveLength(0);
    });

    it('should not return stories that have exhausted max attempts', async () => {
      const { tenantId, projectId, epicId } = await seedEpicContext();
      const { storyRepo } = getRepos();

      // Create story with maxAttempts = 0 so it can never be assigned
      const story = await storyRepo.create(tenantId, epicId, makeStoryData({ maxAttempts: 0 }));
      await storyRepo.update(tenantId, story.id, { workStatus: 'ready' }, story.version);

      const readyStories = await storyRepo.findReadyForAssignment(tenantId, projectId);

      expect(readyStories).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Tenant isolation
  // -----------------------------------------------------------------------

  describe('tenant isolation', () => {
    it('should not return stories belonging to another tenant', async () => {
      const ctx = await seedEpicContext();
      const tenantB = await seedTenant(getTestDb());
      const { storyRepo } = getRepos();

      const story = await storyRepo.create(ctx.tenantId, ctx.epicId, makeStoryData());

      const found = await storyRepo.findById(tenantB, story.id);
      expect(found).toBeNull();
    });

    it('should not return ready stories across tenants in findReadyForAssignment', async () => {
      const ctxA = await seedEpicContext();
      const tenantB = await seedTenant(getTestDb());
      const { storyRepo } = getRepos();

      const story = await storyRepo.create(ctxA.tenantId, ctxA.epicId, makeStoryData());
      await storyRepo.update(ctxA.tenantId, story.id, { workStatus: 'ready' }, story.version);

      // Tenant B searching with project A's ID should return nothing
      const readyStories = await storyRepo.findReadyForAssignment(tenantB, ctxA.projectId);
      expect(readyStories).toHaveLength(0);
    });
  });
});
