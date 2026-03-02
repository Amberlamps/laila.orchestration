/**
 * Integration tests for TaskRepository.
 *
 * Covers:
 * - CRUD operations with story association
 * - Dependency edge add/remove
 * - Self-loop prevention
 * - Task graph retrieval
 * - Bulk status update
 * - Blocked task detection
 * - Tenant isolation
 */

import { describe, it, expect } from 'vitest';

import { ConflictError, NotFoundError, ValidationError } from '../base-repository';
import { createEpicRepository } from '../epic-repository';
import { createProjectRepository } from '../project-repository';
import { createStoryRepository } from '../story-repository';
import { createTaskRepository } from '../task-repository';

import { seedTenant, makeProjectData, makeEpicData, makeStoryData, makeTaskData } from './fixtures';
import { HAS_DATABASE, getTestDb, setupTestTransaction } from './setup';

describe.skipIf(!HAS_DATABASE)('TaskRepository', () => {
  setupTestTransaction();

  const getRepos = () => ({
    taskRepo: createTaskRepository(getTestDb()),
    storyRepo: createStoryRepository(getTestDb()),
    epicRepo: createEpicRepository(getTestDb()),
    projectRepo: createProjectRepository(getTestDb()),
  });

  /** Helper: creates a full hierarchy (tenant > project > epic > story) */
  const seedStoryContext = async () => {
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
    it('should create a task with correct defaults', async () => {
      const { tenantId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();
      const data = makeTaskData();

      const task = await taskRepo.create(tenantId, storyId, data);

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.tenantId).toBe(tenantId);
      expect(task.userStoryId).toBe(storyId);
      expect(task.title).toBe(data.title);
      expect(task.workStatus).toBe('pending');
      expect(task.version).toBe(0);
      expect(task.acceptanceCriteria).toEqual(data.acceptanceCriteria);
    });

    it('should find a task by ID', async () => {
      const { tenantId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();
      const created = await taskRepo.create(tenantId, storyId, makeTaskData());

      const found = await taskRepo.findById(tenantId, created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('should update a task with optimistic locking', async () => {
      const { tenantId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();
      const task = await taskRepo.create(tenantId, storyId, makeTaskData());

      const updated = await taskRepo.update(
        tenantId,
        task.id,
        { title: 'Updated Task Title' },
        task.version,
      );

      expect(updated.title).toBe('Updated Task Title');
      expect(updated.version).toBe(task.version + 1);
    });

    it('should throw ConflictError on stale version update', async () => {
      const { tenantId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();
      const task = await taskRepo.create(tenantId, storyId, makeTaskData());

      await taskRepo.update(tenantId, task.id, { title: 'First' }, task.version);

      await expect(
        taskRepo.update(tenantId, task.id, { title: 'Stale' }, task.version),
      ).rejects.toThrow(ConflictError);
    });

    it('should soft-delete a task', async () => {
      const { tenantId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();
      const task = await taskRepo.create(tenantId, storyId, makeTaskData());

      const deleted = await taskRepo.softDelete(tenantId, task.id);
      expect(deleted).not.toBeNull();

      const found = await taskRepo.findById(tenantId, task.id);
      expect(found).toBeNull();
    });

    it('should list tasks by story', async () => {
      const { tenantId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();

      await taskRepo.create(tenantId, storyId, makeTaskData());
      await taskRepo.create(tenantId, storyId, makeTaskData());
      await taskRepo.create(tenantId, storyId, makeTaskData());

      const result = await taskRepo.findByStory(tenantId, storyId);

      expect(result.data).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // Dependency edge management
  // -----------------------------------------------------------------------

  describe('dependency edge management', () => {
    it('should add a dependency between two tasks', async () => {
      const { tenantId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();

      const taskA = await taskRepo.create(tenantId, storyId, makeTaskData({ title: 'Task A' }));
      const taskB = await taskRepo.create(tenantId, storyId, makeTaskData({ title: 'Task B' }));

      const edge = await taskRepo.addDependency(tenantId, taskB.id, taskA.id);

      expect(edge).toBeDefined();
      expect(edge.dependentTaskId).toBe(taskB.id);
      expect(edge.prerequisiteTaskId).toBe(taskA.id);
      expect(edge.tenantId).toBe(tenantId);
    });

    it('should remove a dependency between two tasks', async () => {
      const { tenantId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();

      const taskA = await taskRepo.create(tenantId, storyId, makeTaskData());
      const taskB = await taskRepo.create(tenantId, storyId, makeTaskData());

      await taskRepo.addDependency(tenantId, taskB.id, taskA.id);
      const removed = await taskRepo.removeDependency(tenantId, taskB.id, taskA.id);

      expect(removed).not.toBeNull();
      expect(removed!.dependentTaskId).toBe(taskB.id);
      expect(removed!.prerequisiteTaskId).toBe(taskA.id);
    });

    it('should return null when removing a nonexistent dependency', async () => {
      const { tenantId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();

      const taskA = await taskRepo.create(tenantId, storyId, makeTaskData());
      const taskB = await taskRepo.create(tenantId, storyId, makeTaskData());

      const removed = await taskRepo.removeDependency(tenantId, taskB.id, taskA.id);
      expect(removed).toBeNull();
    });

    it('should retrieve dependencies (prerequisites) for a task', async () => {
      const { tenantId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();

      const prereq1 = await taskRepo.create(tenantId, storyId, makeTaskData({ title: 'Prereq 1' }));
      const prereq2 = await taskRepo.create(tenantId, storyId, makeTaskData({ title: 'Prereq 2' }));
      const dependent = await taskRepo.create(
        tenantId,
        storyId,
        makeTaskData({ title: 'Dependent' }),
      );

      await taskRepo.addDependency(tenantId, dependent.id, prereq1.id);
      await taskRepo.addDependency(tenantId, dependent.id, prereq2.id);

      const deps = await taskRepo.getDependencies(tenantId, dependent.id);

      expect(deps).toHaveLength(2);
      const depIds = deps.map((d) => d.id);
      expect(depIds).toContain(prereq1.id);
      expect(depIds).toContain(prereq2.id);
    });

    it('should retrieve dependents (downstream tasks) for a task', async () => {
      const { tenantId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();

      const prereq = await taskRepo.create(tenantId, storyId, makeTaskData({ title: 'Prereq' }));
      const dep1 = await taskRepo.create(tenantId, storyId, makeTaskData({ title: 'Dep 1' }));
      const dep2 = await taskRepo.create(tenantId, storyId, makeTaskData({ title: 'Dep 2' }));

      await taskRepo.addDependency(tenantId, dep1.id, prereq.id);
      await taskRepo.addDependency(tenantId, dep2.id, prereq.id);

      const dependents = await taskRepo.getDependents(tenantId, prereq.id);

      expect(dependents).toHaveLength(2);
      const depIds = dependents.map((d) => d.id);
      expect(depIds).toContain(dep1.id);
      expect(depIds).toContain(dep2.id);
    });
  });

  // -----------------------------------------------------------------------
  // Self-loop prevention
  // -----------------------------------------------------------------------

  describe('self-loop prevention', () => {
    it('should throw ValidationError when a task depends on itself', async () => {
      const { tenantId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();

      const task = await taskRepo.create(tenantId, storyId, makeTaskData());

      await expect(taskRepo.addDependency(tenantId, task.id, task.id)).rejects.toThrow(
        ValidationError,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Task graph retrieval
  // -----------------------------------------------------------------------

  describe('task graph retrieval', () => {
    it('should return all tasks and edges for a project', async () => {
      const { tenantId, projectId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();

      const taskA = await taskRepo.create(tenantId, storyId, makeTaskData({ title: 'A' }));
      const taskB = await taskRepo.create(tenantId, storyId, makeTaskData({ title: 'B' }));
      const taskC = await taskRepo.create(tenantId, storyId, makeTaskData({ title: 'C' }));

      await taskRepo.addDependency(tenantId, taskB.id, taskA.id);
      await taskRepo.addDependency(tenantId, taskC.id, taskB.id);

      const graph = await taskRepo.getTaskGraph(tenantId, projectId);

      expect(graph.tasks).toHaveLength(3);
      expect(graph.edges).toHaveLength(2);
    });

    it('should return empty graph when project has no tasks', async () => {
      const { tenantId, projectId } = await seedStoryContext();
      const { taskRepo } = getRepos();

      // seedStoryContext creates a story but no tasks
      const graph = await taskRepo.getTaskGraph(tenantId, projectId);
      expect(graph.tasks).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Bulk status update
  // -----------------------------------------------------------------------

  describe('bulk status update', () => {
    it('should update status for multiple tasks at once', async () => {
      const { tenantId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();

      const task1 = await taskRepo.create(tenantId, storyId, makeTaskData());
      const task2 = await taskRepo.create(tenantId, storyId, makeTaskData());
      const task3 = await taskRepo.create(tenantId, storyId, makeTaskData());

      const count = await taskRepo.bulkUpdateStatus(
        tenantId,
        [task1.id, task2.id, task3.id],
        'in_progress',
      );

      expect(count).toBe(3);

      // Verify each task was updated
      const updated1 = await taskRepo.findById(tenantId, task1.id);
      const updated2 = await taskRepo.findById(tenantId, task2.id);
      const updated3 = await taskRepo.findById(tenantId, task3.id);

      expect(updated1!.workStatus).toBe('in_progress');
      expect(updated2!.workStatus).toBe('in_progress');
      expect(updated3!.workStatus).toBe('in_progress');
    });

    it('should return 0 when updating an empty array', async () => {
      const tenantId = await seedTenant(getTestDb());
      const { taskRepo } = getRepos();

      const count = await taskRepo.bulkUpdateStatus(tenantId, [], 'done');
      expect(count).toBe(0);
    });

    it('should only update tasks belonging to the correct tenant', async () => {
      const ctxA = await seedStoryContext();
      const tenantB = await seedTenant(getTestDb());
      const { taskRepo } = getRepos();

      const task = await taskRepo.create(ctxA.tenantId, ctxA.storyId, makeTaskData());

      // Tenant B tries to bulk-update tenant A's task
      const count = await taskRepo.bulkUpdateStatus(tenantB, [task.id], 'done');
      expect(count).toBe(0);

      // Task should still be pending
      const found = await taskRepo.findById(ctxA.tenantId, task.id);
      expect(found!.workStatus).toBe('pending');
    });
  });

  // -----------------------------------------------------------------------
  // Blocked task detection
  // -----------------------------------------------------------------------

  describe('blocked task detection', () => {
    it('should find blocked tasks whose prerequisites are all done', async () => {
      const { tenantId, projectId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();

      const prereq = await taskRepo.create(
        tenantId,
        storyId,
        makeTaskData({ title: 'Prerequisite' }),
      );
      const blocked = await taskRepo.create(tenantId, storyId, makeTaskData({ title: 'Blocked' }));

      // Create dependency: blocked depends on prereq
      await taskRepo.addDependency(tenantId, blocked.id, prereq.id);

      // Set blocked task to 'blocked' status
      await taskRepo.bulkUpdateStatus(tenantId, [blocked.id], 'blocked');

      // Set prereq to 'done'
      await taskRepo.bulkUpdateStatus(tenantId, [prereq.id], 'done');

      const unblockedTasks = await taskRepo.findBlockedTasks(tenantId, projectId);

      expect(unblockedTasks).toHaveLength(1);
      expect(unblockedTasks[0]!.id).toBe(blocked.id);
    });

    it('should not return blocked tasks whose prerequisites are not all done', async () => {
      const { tenantId, projectId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();

      const prereq1 = await taskRepo.create(tenantId, storyId, makeTaskData({ title: 'Prereq 1' }));
      const prereq2 = await taskRepo.create(tenantId, storyId, makeTaskData({ title: 'Prereq 2' }));
      const blocked = await taskRepo.create(tenantId, storyId, makeTaskData({ title: 'Blocked' }));

      await taskRepo.addDependency(tenantId, blocked.id, prereq1.id);
      await taskRepo.addDependency(tenantId, blocked.id, prereq2.id);

      await taskRepo.bulkUpdateStatus(tenantId, [blocked.id], 'blocked');
      // Only prereq1 is done, prereq2 is still pending
      await taskRepo.bulkUpdateStatus(tenantId, [prereq1.id], 'done');

      const unblockedTasks = await taskRepo.findBlockedTasks(tenantId, projectId);

      expect(unblockedTasks).toHaveLength(0);
    });

    it('should return empty array when no tasks are blocked', async () => {
      const { tenantId, projectId, storyId } = await seedStoryContext();
      const { taskRepo } = getRepos();

      await taskRepo.create(tenantId, storyId, makeTaskData());

      const unblockedTasks = await taskRepo.findBlockedTasks(tenantId, projectId);
      expect(unblockedTasks).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Tenant isolation
  // -----------------------------------------------------------------------

  describe('tenant isolation', () => {
    it('should not return tasks belonging to another tenant', async () => {
      const ctxA = await seedStoryContext();
      const tenantB = await seedTenant(getTestDb());
      const { taskRepo } = getRepos();

      const task = await taskRepo.create(ctxA.tenantId, ctxA.storyId, makeTaskData());

      const found = await taskRepo.findById(tenantB, task.id);
      expect(found).toBeNull();
    });

    it('should not allow adding dependency across tenants', async () => {
      const ctxA = await seedStoryContext();
      const ctxB = await seedStoryContext();
      const { taskRepo } = getRepos();

      const taskA = await taskRepo.create(ctxA.tenantId, ctxA.storyId, makeTaskData());
      const taskB = await taskRepo.create(ctxB.tenantId, ctxB.storyId, makeTaskData());

      // Tenant A tries to add a dependency where taskB belongs to tenant B
      await expect(taskRepo.addDependency(ctxA.tenantId, taskA.id, taskB.id)).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should not return task graph across tenants', async () => {
      const ctxA = await seedStoryContext();
      const tenantB = await seedTenant(getTestDb());
      const { taskRepo } = getRepos();

      await taskRepo.create(ctxA.tenantId, ctxA.storyId, makeTaskData());

      // Tenant B querying project A's task graph should get empty results
      const graph = await taskRepo.getTaskGraph(tenantB, ctxA.projectId);
      expect(graph.tasks).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
    });
  });
});
