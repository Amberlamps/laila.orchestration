// MSW v2 request handlers for mocking the REST API during E2E tests.
// Each handler returns factory-generated data with correct relationships.
import { http, HttpResponse, type HttpHandler } from 'msw';

import {
  createMockProject,
  createMockEpic,
  createMockStory,
  createMockTask,
  createMockWorker,
  createMockPersona,
  createMockAuditLogEntry,
  type MockProject,
  type MockEpic,
  type MockStory,
  type MockTask,
  type MockWorker,
  type MockPersona,
  type MockAuditLogEntry,
} from './entity-factories';

// In-memory data store for stateful E2E test scenarios.
// MSW handlers read from and write to this store, enabling
// tests to create entities and verify their persistence.
export interface TestDataStore {
  projects: Map<string, MockProject>;
  epics: Map<string, MockEpic>;
  stories: Map<string, MockStory>;
  tasks: Map<string, MockTask>;
  workers: Map<string, MockWorker>;
  personas: Map<string, MockPersona>;
  auditLog: MockAuditLogEntry[];
}

// Singleton data store. Reset between tests via resetTestData().
function createEmptyStore(): TestDataStore {
  return {
    projects: new Map(),
    epics: new Map(),
    stories: new Map(),
    tasks: new Map(),
    workers: new Map(),
    personas: new Map(),
    auditLog: [],
  };
}

let dataStore: TestDataStore = createEmptyStore();

/** Reset all test data between test runs. */
export const resetTestData = (): void => {
  dataStore = createEmptyStore();
};

/** Seed the data store with pre-built entities for a test scenario. */
export const seedTestData = (seed: Partial<TestDataStore>): void => {
  if (seed.projects) {
    seed.projects.forEach((p, id) => dataStore.projects.set(id, p));
  }
  if (seed.epics) {
    seed.epics.forEach((e, id) => dataStore.epics.set(id, e));
  }
  if (seed.stories) {
    seed.stories.forEach((s, id) => dataStore.stories.set(id, s));
  }
  if (seed.tasks) {
    seed.tasks.forEach((t, id) => dataStore.tasks.set(id, t));
  }
  if (seed.workers) {
    seed.workers.forEach((w, id) => dataStore.workers.set(id, w));
  }
  if (seed.personas) {
    seed.personas.forEach((p, id) => dataStore.personas.set(id, p));
  }
  if (seed.auditLog) {
    dataStore.auditLog.push(...seed.auditLog);
  }
};

const timestamp = (): string => new Date().toISOString();

/** All MSW handlers for the /api/v1 REST API. */
export const apiHandlers: HttpHandler[] = [
  // ---- Projects: full CRUD ----

  http.get('/api/v1/projects', () => {
    return HttpResponse.json({
      data: Array.from(dataStore.projects.values()),
    });
  }),

  http.get('/api/v1/projects/:id', ({ params }) => {
    const project = dataStore.projects.get(params.id as string);
    if (!project) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: project });
  }),

  http.post('/api/v1/projects', async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      description: string;
    };
    const project = createMockProject({
      name: body.name,
      description: body.description,
    });
    dataStore.projects.set(project.id, project);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'project.created',
        entityId: project.id,
        entityName: project.name,
        entityType: 'project',
      }),
    );
    return HttpResponse.json({ data: project }, { status: 201 });
  }),

  http.put('/api/v1/projects/:id', async ({ params, request }) => {
    const id = params.id as string;
    const project = dataStore.projects.get(id);
    if (!project) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as Partial<MockProject>;
    const updated: MockProject = {
      ...project,
      ...body,
      id, // preserve original ID
      updatedAt: timestamp(),
    };
    dataStore.projects.set(id, updated);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'project.updated',
        entityId: id,
        entityName: updated.name,
        entityType: 'project',
      }),
    );
    return HttpResponse.json({ data: updated });
  }),

  http.delete('/api/v1/projects/:id', ({ params }) => {
    const id = params.id as string;
    const project = dataStore.projects.get(id);
    if (!project) return new HttpResponse(null, { status: 404 });
    dataStore.projects.delete(id);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'project.deleted',
        entityId: id,
        entityName: project.name,
        entityType: 'project',
      }),
    );
    return HttpResponse.json({ data: { deleted: true } });
  }),

  // ---- Epics: full CRUD ----

  http.get('/api/v1/projects/:projectId/epics', ({ params }) => {
    const projectId = params.projectId as string;
    const epics = Array.from(dataStore.epics.values()).filter((e) => e.projectId === projectId);
    return HttpResponse.json({ data: epics });
  }),

  http.get('/api/v1/epics/:id', ({ params }) => {
    const epic = dataStore.epics.get(params.id as string);
    if (!epic) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: epic });
  }),

  http.post('/api/v1/projects/:projectId/epics', async ({ params, request }) => {
    const body = (await request.json()) as {
      title: string;
      description: string;
    };
    const epic = createMockEpic({
      projectId: params.projectId as string,
      title: body.title,
      description: body.description,
    });
    dataStore.epics.set(epic.id, epic);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'epic.created',
        entityId: epic.id,
        entityName: epic.title,
        entityType: 'epic',
      }),
    );
    return HttpResponse.json({ data: epic }, { status: 201 });
  }),

  http.put('/api/v1/epics/:id', async ({ params, request }) => {
    const id = params.id as string;
    const epic = dataStore.epics.get(id);
    if (!epic) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as Partial<MockEpic>;
    const updated: MockEpic = {
      ...epic,
      ...body,
      id,
      updatedAt: timestamp(),
    };
    dataStore.epics.set(id, updated);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'epic.updated',
        entityId: id,
        entityName: updated.title,
        entityType: 'epic',
      }),
    );
    return HttpResponse.json({ data: updated });
  }),

  http.delete('/api/v1/epics/:id', ({ params }) => {
    const id = params.id as string;
    const epic = dataStore.epics.get(id);
    if (!epic) return new HttpResponse(null, { status: 404 });
    dataStore.epics.delete(id);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'epic.deleted',
        entityId: id,
        entityName: epic.title,
        entityType: 'epic',
      }),
    );
    return HttpResponse.json({ data: { deleted: true } });
  }),

  // ---- Stories: full CRUD ----

  http.get('/api/v1/epics/:epicId/stories', ({ params }) => {
    const epicId = params.epicId as string;
    const stories = Array.from(dataStore.stories.values()).filter((s) => s.epicId === epicId);
    return HttpResponse.json({ data: stories });
  }),

  http.get('/api/v1/stories/:id', ({ params }) => {
    const story = dataStore.stories.get(params.id as string);
    if (!story) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: story });
  }),

  http.post('/api/v1/epics/:epicId/stories', async ({ params, request }) => {
    const body = (await request.json()) as {
      title: string;
      description: string;
    };
    const story = createMockStory({
      epicId: params.epicId as string,
      title: body.title,
      description: body.description,
    });
    dataStore.stories.set(story.id, story);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'story.created',
        entityId: story.id,
        entityName: story.title,
        entityType: 'story',
      }),
    );
    return HttpResponse.json({ data: story }, { status: 201 });
  }),

  http.put('/api/v1/stories/:id', async ({ params, request }) => {
    const id = params.id as string;
    const story = dataStore.stories.get(id);
    if (!story) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as Partial<MockStory>;
    const updated: MockStory = {
      ...story,
      ...body,
      id,
      updatedAt: timestamp(),
    };
    dataStore.stories.set(id, updated);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'story.updated',
        entityId: id,
        entityName: updated.title,
        entityType: 'story',
      }),
    );
    return HttpResponse.json({ data: updated });
  }),

  http.delete('/api/v1/stories/:id', ({ params }) => {
    const id = params.id as string;
    const story = dataStore.stories.get(id);
    if (!story) return new HttpResponse(null, { status: 404 });
    dataStore.stories.delete(id);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'story.deleted',
        entityId: id,
        entityName: story.title,
        entityType: 'story',
      }),
    );
    return HttpResponse.json({ data: { deleted: true } });
  }),

  // ---- Tasks: full CRUD ----

  http.get('/api/v1/stories/:storyId/tasks', ({ params }) => {
    const storyId = params.storyId as string;
    const tasks = Array.from(dataStore.tasks.values()).filter((t) => t.storyId === storyId);
    return HttpResponse.json({ data: tasks });
  }),

  http.get('/api/v1/tasks/:id', ({ params }) => {
    const task = dataStore.tasks.get(params.id as string);
    if (!task) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: task });
  }),

  http.post('/api/v1/stories/:storyId/tasks', async ({ params, request }) => {
    const body = (await request.json()) as {
      title: string;
      description: string;
      personaId: string;
      acceptanceCriteria?: string[];
      dependsOn?: string[];
    };
    const task = createMockTask({
      storyId: params.storyId as string,
      title: body.title,
      description: body.description,
      personaId: body.personaId,
      ...(body.acceptanceCriteria !== undefined
        ? { acceptanceCriteria: body.acceptanceCriteria }
        : {}),
      ...(body.dependsOn !== undefined ? { dependsOn: body.dependsOn } : {}),
    });
    dataStore.tasks.set(task.id, task);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'task.created',
        entityId: task.id,
        entityName: task.title,
        entityType: 'task',
      }),
    );
    return HttpResponse.json({ data: task }, { status: 201 });
  }),

  http.put('/api/v1/tasks/:id', async ({ params, request }) => {
    const id = params.id as string;
    const task = dataStore.tasks.get(id);
    if (!task) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as Partial<MockTask>;
    const updated: MockTask = {
      ...task,
      ...body,
      id,
      updatedAt: timestamp(),
    };
    dataStore.tasks.set(id, updated);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'task.updated',
        entityId: id,
        entityName: updated.title,
        entityType: 'task',
      }),
    );
    return HttpResponse.json({ data: updated });
  }),

  http.delete('/api/v1/tasks/:id', ({ params }) => {
    const id = params.id as string;
    const task = dataStore.tasks.get(id);
    if (!task) return new HttpResponse(null, { status: 404 });
    dataStore.tasks.delete(id);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'task.deleted',
        entityId: id,
        entityName: task.title,
        entityType: 'task',
      }),
    );
    return HttpResponse.json({ data: { deleted: true } });
  }),

  // ---- Workers: full CRUD ----

  http.get('/api/v1/workers', () => {
    return HttpResponse.json({
      data: Array.from(dataStore.workers.values()),
    });
  }),

  http.get('/api/v1/workers/:id', ({ params }) => {
    const worker = dataStore.workers.get(params.id as string);
    if (!worker) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: worker });
  }),

  http.post('/api/v1/workers', async ({ request }) => {
    const body = (await request.json()) as { name: string };
    const worker = createMockWorker({ name: body.name });
    dataStore.workers.set(worker.id, worker);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'worker.created',
        entityId: worker.id,
        entityName: worker.name,
        entityType: 'worker',
      }),
    );
    return HttpResponse.json(
      { data: { ...worker, apiKey: `lw_test_${worker.id}` } },
      { status: 201 },
    );
  }),

  http.put('/api/v1/workers/:id', async ({ params, request }) => {
    const id = params.id as string;
    const worker = dataStore.workers.get(id);
    if (!worker) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as Partial<MockWorker>;
    const updated: MockWorker = {
      ...worker,
      ...body,
      id,
      updatedAt: timestamp(),
    };
    dataStore.workers.set(id, updated);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'worker.updated',
        entityId: id,
        entityName: updated.name,
        entityType: 'worker',
      }),
    );
    return HttpResponse.json({ data: updated });
  }),

  http.delete('/api/v1/workers/:id', ({ params }) => {
    const id = params.id as string;
    const worker = dataStore.workers.get(id);
    if (!worker) return new HttpResponse(null, { status: 404 });
    dataStore.workers.delete(id);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'worker.deleted',
        entityId: id,
        entityName: worker.name,
        entityType: 'worker',
      }),
    );
    return HttpResponse.json({ data: { deleted: true } });
  }),

  // Worker project access management.
  http.post('/api/v1/workers/:workerId/projects/:projectId', ({ params }) => {
    const workerId = params.workerId as string;
    const projectId = params.projectId as string;
    const worker = dataStore.workers.get(workerId);
    if (!worker) return new HttpResponse(null, { status: 404 });
    if (!worker.projectIds.includes(projectId)) {
      worker.projectIds.push(projectId);
    }
    return HttpResponse.json({ data: worker });
  }),

  http.delete('/api/v1/workers/:workerId/projects/:projectId', ({ params }) => {
    const workerId = params.workerId as string;
    const projectId = params.projectId as string;
    const worker = dataStore.workers.get(workerId);
    if (!worker) return new HttpResponse(null, { status: 404 });
    worker.projectIds = worker.projectIds.filter((id) => id !== projectId);
    return HttpResponse.json({ data: worker });
  }),

  // ---- Personas: full CRUD ----

  http.get('/api/v1/personas', () => {
    return HttpResponse.json({
      data: Array.from(dataStore.personas.values()),
    });
  }),

  http.get('/api/v1/personas/:id', ({ params }) => {
    const persona = dataStore.personas.get(params.id as string);
    if (!persona) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: persona });
  }),

  http.post('/api/v1/personas', async ({ request }) => {
    const body = (await request.json()) as {
      title: string;
      description: string;
    };
    const persona = createMockPersona({
      title: body.title,
      description: body.description,
    });
    dataStore.personas.set(persona.id, persona);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'persona.created',
        entityId: persona.id,
        entityName: persona.title,
        entityType: 'persona',
      }),
    );
    return HttpResponse.json({ data: persona }, { status: 201 });
  }),

  http.put('/api/v1/personas/:id', async ({ params, request }) => {
    const id = params.id as string;
    const persona = dataStore.personas.get(id);
    if (!persona) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as Partial<MockPersona>;
    const updated: MockPersona = {
      ...persona,
      ...body,
      id,
      updatedAt: timestamp(),
    };
    dataStore.personas.set(id, updated);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'persona.updated',
        entityId: id,
        entityName: updated.title,
        entityType: 'persona',
      }),
    );
    return HttpResponse.json({ data: updated });
  }),

  http.delete('/api/v1/personas/:id', ({ params }) => {
    const id = params.id as string;
    const persona = dataStore.personas.get(id);
    if (!persona) return new HttpResponse(null, { status: 404 });

    // Check if persona is referenced by any tasks.
    const referencingTasks = Array.from(dataStore.tasks.values()).filter((t) => t.personaId === id);
    if (referencingTasks.length > 0) {
      return HttpResponse.json(
        {
          error: `Cannot delete persona: referenced by ${String(referencingTasks.length)} task(s)`,
        },
        { status: 409 },
      );
    }

    dataStore.personas.delete(id);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'persona.deleted',
        entityId: id,
        entityName: persona.title,
        entityType: 'persona',
      }),
    );
    return HttpResponse.json({ data: { deleted: true } });
  }),

  // ---- Validate Dependencies (cycle detection) ----

  http.post('/api/v1/tasks/:id/validate-dependencies', async ({ params, request }) => {
    const taskId = params.id as string;
    const body = (await request.json()) as { dependencyIds: string[] };
    const { dependencyIds } = body;

    // Self-cycle check.
    if (dependencyIds.includes(taskId)) {
      const task = dataStore.tasks.get(taskId);
      const taskName = task?.title ?? taskId;
      return HttpResponse.json({
        valid: false,
        cyclePath: [taskName],
        message: `Circular dependency detected: ${taskName} cannot depend on itself`,
      });
    }

    // Build adjacency list from the data store, with the proposed deps applied.
    const adjList = new Map<string, string[]>();
    for (const [id, t] of dataStore.tasks) {
      if (id === taskId) {
        adjList.set(id, [...dependencyIds]);
      } else {
        adjList.set(id, [...t.dependsOn]);
      }
    }

    // DFS cycle detection starting from taskId.
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const parentMap = new Map<string, string>();

    const dfs = (node: string): string[] | null => {
      visited.add(node);
      inStack.add(node);

      const neighbors = adjList.get(node) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          parentMap.set(neighbor, node);
          const result = dfs(neighbor);
          if (result) return result;
        } else if (inStack.has(neighbor)) {
          // Found a cycle — reconstruct the path.
          const path: string[] = [];
          let current = node;
          path.push(current);
          while (current !== neighbor) {
            const p = parentMap.get(current);
            if (p === undefined) break;
            current = p;
            path.push(current);
          }
          path.reverse();
          return path.map((id) => dataStore.tasks.get(id)?.title ?? id);
        }
      }

      inStack.delete(node);
      return null;
    };

    const cyclePath = dfs(taskId);

    if (cyclePath) {
      return HttpResponse.json({
        valid: false,
        cyclePath,
        message: `Circular dependency detected: ${cyclePath.join(' \u2192 ')}`,
      });
    }

    return HttpResponse.json({ valid: true });
  }),

  // ---- Validate: always returns valid (publish handlers do real validation) ----

  http.post('/api/v1/projects/:projectId/epics/:epicId/stories/:storyId/validate', () => {
    return HttpResponse.json({ data: { valid: true, issues: [] } });
  }),

  http.post('/api/v1/projects/:projectId/epics/:epicId/validate', () => {
    return HttpResponse.json({ data: { valid: true, issues: [] } });
  }),

  http.post('/api/v1/projects/:id/validate', () => {
    return HttpResponse.json({ data: { valid: true, issues: [] } });
  }),

  // ---- Publish: Story ----

  http.post('/api/v1/projects/:projectId/epics/:epicId/stories/:storyId/publish', ({ params }) => {
    const storyId = params.storyId as string;
    const story = dataStore.stories.get(storyId);
    if (!story) return new HttpResponse(null, { status: 404 });

    // Validate story is in draft status.
    if (story.status !== 'draft') {
      return HttpResponse.json(
        {
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot publish story: current status is '${story.status}', expected 'draft'`,
          },
        },
        { status: 409 },
      );
    }

    // Validate all tasks have persona and acceptance criteria.
    const storyTasks = Array.from(dataStore.tasks.values()).filter((t) => t.storyId === storyId);

    if (storyTasks.length === 0) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Story must have at least one task before publishing',
          },
        },
        { status: 400 },
      );
    }

    const tasksWithoutPersona = storyTasks.filter((t) => !t.personaId);
    if (tasksWithoutPersona.length > 0) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: `Cannot publish story: ${String(tasksWithoutPersona.length)} task(s) missing persona assignment`,
          },
        },
        { status: 400 },
      );
    }

    const tasksWithoutAC = storyTasks.filter((t) => t.acceptanceCriteria.length === 0);
    if (tasksWithoutAC.length > 0) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: `Cannot publish story: ${String(tasksWithoutAC.length)} task(s) missing acceptance criteria`,
          },
        },
        { status: 400 },
      );
    }

    // Transition story to ready.
    story.status = 'ready';
    story.updatedAt = timestamp();
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'story.published',
        entityId: storyId,
        entityName: story.title,
        entityType: 'story',
      }),
    );
    return HttpResponse.json({ data: story });
  }),

  // ---- Publish: Epic ----

  http.post('/api/v1/projects/:projectId/epics/:epicId/publish', ({ params }) => {
    const epicId = params.epicId as string;
    const epic = dataStore.epics.get(epicId);
    if (!epic) return new HttpResponse(null, { status: 404 });

    // Validate epic is in draft status.
    if (epic.status !== 'draft') {
      return HttpResponse.json(
        {
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot publish epic: current status is '${epic.status}', expected 'draft'`,
          },
        },
        { status: 409 },
      );
    }

    // Validate all stories are in ready status.
    const epicStories = Array.from(dataStore.stories.values()).filter((s) => s.epicId === epicId);

    if (epicStories.length === 0) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Epic must have at least one story before publishing',
          },
        },
        { status: 400 },
      );
    }

    const nonReadyStories = epicStories.filter((s) => s.status !== 'ready');
    if (nonReadyStories.length > 0) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: `Cannot publish epic: ${String(nonReadyStories.length)} stories are not ready`,
          },
        },
        { status: 400 },
      );
    }

    // Transition epic to ready.
    epic.status = 'ready';
    epic.updatedAt = timestamp();
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'epic.published',
        entityId: epicId,
        entityName: epic.title,
        entityType: 'epic',
      }),
    );
    return HttpResponse.json({ data: epic });
  }),

  // ---- Publish: Project ----

  http.post('/api/v1/projects/:id/publish', ({ params }) => {
    const id = params.id as string;
    const project = dataStore.projects.get(id);
    if (!project) return new HttpResponse(null, { status: 404 });

    // Validate project is in draft status.
    if (project.status !== 'draft') {
      return HttpResponse.json(
        {
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot publish project: current status is '${project.status}', expected 'draft'`,
          },
        },
        { status: 409 },
      );
    }

    // Validate all epics are in ready status.
    const projectEpics = Array.from(dataStore.epics.values()).filter((e) => e.projectId === id);

    if (projectEpics.length === 0) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Project must have at least one epic before publishing',
          },
        },
        { status: 400 },
      );
    }

    const nonReadyEpics = projectEpics.filter((e) => e.status !== 'ready');
    if (nonReadyEpics.length > 0) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: `Cannot publish project: ${String(nonReadyEpics.length)} epics are not ready`,
          },
        },
        { status: 400 },
      );
    }

    // Transition project to ready.
    project.status = 'ready';
    project.updatedAt = timestamp();
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'project.published',
        entityId: id,
        entityName: project.name,
        entityType: 'project',
      }),
    );
    return HttpResponse.json({ data: project });
  }),

  // ---- Work Assignment (Orchestration) ----

  http.post('/api/v1/work/request', async ({ request }) => {
    // Simulate worker requesting work. Find the first story
    // in "not-started" status and assign it to the requesting worker.
    const body = (await request.json()) as { workerId: string };
    const availableStory = Array.from(dataStore.stories.values()).find(
      (s) => s.status === 'not-started',
    );
    if (!availableStory) {
      return HttpResponse.json({ data: null, message: 'No work available' });
    }
    availableStory.status = 'in-progress';
    availableStory.assignedWorkerId = body.workerId;
    availableStory.updatedAt = timestamp();
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'story.assigned',
        entityId: availableStory.id,
        entityName: availableStory.title,
        entityType: 'story',
        metadata: { workerId: body.workerId },
      }),
    );
    return HttpResponse.json({ data: availableStory });
  }),

  // ---- Audit Log ----

  http.get('/api/v1/audit-log', () => {
    return HttpResponse.json({
      data: dataStore.auditLog.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    });
  }),
];
