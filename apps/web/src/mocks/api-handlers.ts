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
  createMockAttempt,
  createMockAuditLogEntry,
  type MockProject,
  type MockEpic,
  type MockStory,
  type MockTask,
  type MockWorker,
  type MockPersona,
  type MockAttempt,
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
  attempts: MockAttempt[];
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
    attempts: [],
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
  if (seed.attempts) {
    dataStore.attempts.push(...seed.attempts);
  }
  if (seed.auditLog) {
    dataStore.auditLog.push(...seed.auditLog);
  }
};

const timestamp = (): string => new Date().toISOString();

/**
 * Maps the mock entity status to the API workStatus format.
 * The story detail page reads `workStatus` from the API response.
 */
const mapToWorkStatus = (status: string): string => {
  switch (status) {
    case 'draft':
      return 'pending';
    case 'not-started':
      return 'pending';
    case 'ready':
      return 'ready';
    case 'blocked':
      return 'blocked';
    case 'in-progress':
      return 'in_progress';
    case 'completed':
      return 'done';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
};

/**
 * Enriches a mock story with API-compatible fields.
 * Preserves any fields already set on the story (e.g. workStatus
 * set by seed data or mutation handlers).
 */
const enrichStory = (story: MockStory): Record<string, unknown> => {
  const record = story as unknown as Record<string, unknown>;
  return {
    ...story,
    workStatus:
      typeof record.workStatus === 'string' ? record.workStatus : mapToWorkStatus(story.status),
    priority: typeof record.priority === 'string' ? record.priority : 'medium',
    version: typeof record.version === 'number' ? record.version : 1,
    tenantId: typeof record.tenantId === 'string' ? record.tenantId : 'test-tenant',
    costEstimate: record.costEstimate ?? null,
    actualCost: record.actualCost ?? null,
    assignedAt:
      record.assignedAt !== undefined
        ? record.assignedAt
        : story.assignedWorkerId
          ? story.updatedAt
          : null,
    attempts: typeof record.attempts === 'number' ? record.attempts : 0,
    maxAttempts: typeof record.maxAttempts === 'number' ? record.maxAttempts : 3,
    completedAt:
      record.completedAt !== undefined
        ? record.completedAt
        : story.status === 'completed'
          ? story.updatedAt
          : null,
  };
};

/**
 * Enriches a mock project with API-compatible fields.
 * Maps the mock status to workStatus and adds missing API fields.
 */
const enrichProject = (project: MockProject): Record<string, unknown> => {
  const record = project as unknown as Record<string, unknown>;
  return {
    ...project,
    workStatus:
      typeof record.workStatus === 'string' ? record.workStatus : mapToWorkStatus(project.status),
    version: typeof record.version === 'number' ? record.version : 1,
    tenantId: typeof record.tenantId === 'string' ? record.tenantId : 'test-tenant',
    lifecycleStatus:
      typeof record.lifecycleStatus === 'string' ? record.lifecycleStatus : project.status,
  };
};

/**
 * Enriches a mock task with API-compatible fields.
 * Maps the mock status to workStatus and adds missing API fields.
 */
const enrichTask = (task: MockTask): Record<string, unknown> => {
  const record = task as unknown as Record<string, unknown>;
  return {
    ...task,
    workStatus:
      typeof record.workStatus === 'string' ? record.workStatus : mapToWorkStatus(task.status),
    userStoryId: task.storyId,
    version: typeof record.version === 'number' ? record.version : 1,
    tenantId: typeof record.tenantId === 'string' ? record.tenantId : 'test-tenant',
    dependencyIds: task.dependsOn,
    references:
      typeof record.references === 'object' && Array.isArray(record.references)
        ? record.references
        : [],
    technicalNotes: typeof record.technicalNotes === 'string' ? record.technicalNotes : null,
  };
};

/**
 * Resolves the project context for an audit log entity.
 * Walks up the entity hierarchy (task -> story -> epic -> project)
 * to find the owning project ID and name.
 */
const resolveProjectForEntity = (
  entityType: string,
  entityId: string,
): { projectId: string; projectName: string } => {
  const unknown = { projectId: '', projectName: '' };

  if (entityType === 'project') {
    const project = dataStore.projects.get(entityId);
    return project ? { projectId: project.id, projectName: project.name } : unknown;
  }

  if (entityType === 'epic') {
    const epic = dataStore.epics.get(entityId);
    if (!epic) return unknown;
    const project = dataStore.projects.get(epic.projectId);
    return project ? { projectId: project.id, projectName: project.name } : unknown;
  }

  if (entityType === 'story') {
    const story = dataStore.stories.get(entityId);
    if (!story) return unknown;
    const epic = dataStore.epics.get(story.epicId);
    if (!epic) return unknown;
    const project = dataStore.projects.get(epic.projectId);
    return project ? { projectId: project.id, projectName: project.name } : unknown;
  }

  if (entityType === 'task') {
    const task = dataStore.tasks.get(entityId);
    if (!task) return unknown;
    const story = dataStore.stories.get(task.storyId);
    if (!story) return unknown;
    const epic = dataStore.epics.get(story.epicId);
    if (!epic) return unknown;
    const project = dataStore.projects.get(epic.projectId);
    return project ? { projectId: project.id, projectName: project.name } : unknown;
  }

  return unknown;
};

/** All MSW handlers for the /api/v1 REST API. */
export const apiHandlers: HttpHandler[] = [
  // ---- Projects: full CRUD ----

  http.get('/api/v1/projects', () => {
    const projects = Array.from(dataStore.projects.values());
    return HttpResponse.json({
      data: projects.map(enrichProject),
      pagination: { total: projects.length, page: 1, limit: 50 },
    });
  }),

  http.get('/api/v1/projects/:id', ({ params }) => {
    const project = dataStore.projects.get(params.id as string);
    if (!project) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: enrichProject(project) });
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
    return HttpResponse.json({ data: enrichStory(story) });
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

    // Enforce read-only when story is in-progress.
    if (story.status === 'in-progress') {
      return HttpResponse.json(
        { error: 'Cannot modify story while it is in progress' },
        { status: 409 },
      );
    }

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

  http.patch('/api/v1/stories/:id', async ({ params, request }) => {
    const id = params.id as string;
    const story = dataStore.stories.get(id);
    if (!story) return new HttpResponse(null, { status: 404 });

    // Enforce read-only when story is in-progress.
    if (story.status === 'in-progress') {
      return HttpResponse.json(
        { error: 'Cannot modify story while it is in progress' },
        { status: 409 },
      );
    }

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

    // Enforce read-only when story is in-progress.
    if (story.status === 'in-progress') {
      return HttpResponse.json(
        { error: 'Cannot delete story while it is in progress' },
        { status: 409 },
      );
    }

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
    return HttpResponse.json({
      data: tasks.map(enrichTask),
      pagination: { total: tasks.length, page: 1, limit: 50 },
    });
  }),

  http.get('/api/v1/tasks/:id', ({ params }) => {
    const task = dataStore.tasks.get(params.id as string);
    if (!task) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: enrichTask(task) });
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

  // ---- Story Failure ----

  http.post('/api/v1/stories/:id/fail', async ({ params, request }) => {
    const id = params.id as string;
    const story = dataStore.stories.get(id);
    if (!story) return new HttpResponse(null, { status: 404 });

    const body = (await request.json()) as {
      errorMessage: string;
      failedTaskId?: string;
    };

    // Record the failed attempt before updating the story.
    const worker = story.assignedWorkerId
      ? dataStore.workers.get(story.assignedWorkerId)
      : undefined;
    dataStore.attempts.push(
      createMockAttempt({
        storyId: id,
        workerId: story.assignedWorkerId ?? 'unknown',
        workerName: worker?.name ?? 'Unknown Worker',
        status: 'failed',
        errorMessage: body.errorMessage,
        startedAt: story.updatedAt,
        endedAt: timestamp(),
      }),
    );

    story.status = 'failed';
    story.errorMessage = body.errorMessage;
    story.failedTaskId = body.failedTaskId ?? null;
    story.updatedAt = timestamp();

    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'story.failed',
        entityId: id,
        entityName: story.title,
        entityType: 'story',
        metadata: { errorMessage: body.errorMessage },
      }),
    );

    return HttpResponse.json({ data: story });
  }),

  // ---- Story Reset ----

  http.post('/api/v1/stories/:id/reset', ({ params }) => {
    const id = params.id as string;
    const story = dataStore.stories.get(id);
    if (!story) return new HttpResponse(null, { status: 404 });

    story.status = 'not-started';
    story.errorMessage = null;
    story.failedTaskId = null;
    story.assignedWorkerId = null;
    story.updatedAt = timestamp();

    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'story.reset',
        entityId: id,
        entityName: story.title,
        entityType: 'story',
      }),
    );

    return HttpResponse.json({ data: story });
  }),

  // ---- Story Unassign (nested route used by the UI) ----

  http.post('/api/v1/projects/:projectId/epics/:epicId/stories/:storyId/unassign', ({ params }) => {
    const storyId = params.storyId as string;
    const story = dataStore.stories.get(storyId);
    if (!story) return new HttpResponse(null, { status: 404 });

    // Record the unassigned attempt before updating the story.
    const worker = story.assignedWorkerId
      ? dataStore.workers.get(story.assignedWorkerId)
      : undefined;
    dataStore.attempts.push(
      createMockAttempt({
        storyId,
        workerId: story.assignedWorkerId ?? 'unknown',
        workerName: worker?.name ?? 'Unknown Worker',
        status: 'manual',
        startedAt: story.updatedAt,
        endedAt: timestamp(),
      }),
    );

    // Reset the story to not-started and clear the worker assignment.
    story.status = 'not-started';
    story.assignedWorkerId = null;
    story.updatedAt = timestamp();

    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'story.unassigned',
        entityId: storyId,
        entityName: story.title,
        entityType: 'story',
        metadata: { workerName: worker?.name ?? 'Unknown Worker' },
      }),
    );

    return HttpResponse.json({ data: story });
  }),

  // ---- Attempt History (legacy URL) ----

  http.get('/api/v1/stories/:id/attempts', ({ params }) => {
    const id = params.id as string;
    const story = dataStore.stories.get(id);
    if (!story) return new HttpResponse(null, { status: 404 });

    const storyAttempts = dataStore.attempts.filter((a) => a.storyId === id);
    return HttpResponse.json({ data: storyAttempts });
  }),

  // ---- Attempt History (URL used by useStoryAttemptHistory hook) ----

  http.get('/api/v1/stories/:id/attempt-history', ({ params }) => {
    const id = params.id as string;
    const story = dataStore.stories.get(id);
    if (!story) return new HttpResponse(null, { status: 404 });

    // Map MockAttempt entries to the AttemptEntry shape the UI expects.
    const storyAttempts = dataStore.attempts
      .filter((a) => a.storyId === id)
      .map((a) => {
        const startMs = new Date(a.startedAt).getTime();
        const endMs = new Date(a.endedAt).getTime();
        const durationSeconds = Math.round((endMs - startMs) / 1000);

        // Map MockAttempt.status to AttemptEntry.reason
        let reason: 'timeout' | 'manual' | 'failure' | 'complete' | null;
        switch (a.status) {
          case 'completed':
            reason = 'complete';
            break;
          case 'failed':
            reason = 'failure';
            break;
          case 'timed-out':
            reason = 'timeout';
            break;
          case 'manual':
            reason = 'manual';
            break;
          default:
            reason = null;
        }

        return {
          id: a.id,
          workerId: a.workerId,
          workerName: a.workerName,
          assignedAt: a.startedAt,
          unassignedAt: a.endedAt,
          reason,
          durationSeconds,
        };
      });

    return HttpResponse.json({ data: storyAttempts });
  }),

  // ---- Task Completion (with cascading unblock + story auto-complete) ----

  http.post('/api/v1/tasks/:id/complete', ({ params }) => {
    const id = params.id as string;
    const task = dataStore.tasks.get(id);
    if (!task) return new HttpResponse(null, { status: 404 });

    // Mark the task as completed.
    task.status = 'completed';
    task.updatedAt = timestamp();

    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'task.completed',
        entityId: id,
        entityName: task.title,
        entityType: 'task',
      }),
    );

    // Cascading unblock: check if any blocked tasks that depend on
    // this task now have ALL their dependencies completed.
    const allTasks = Array.from(dataStore.tasks.values());
    for (const otherTask of allTasks) {
      if (otherTask.status !== 'blocked') continue;
      if (!otherTask.dependsOn.includes(id)) continue;

      // Check if ALL dependencies of this blocked task are now completed.
      const allDepsCompleted = otherTask.dependsOn.every((depId) => {
        const depTask = dataStore.tasks.get(depId);
        return depTask?.status === 'completed';
      });

      if (allDepsCompleted) {
        otherTask.status = 'not-started';
        otherTask.updatedAt = timestamp();
        dataStore.auditLog.push(
          createMockAuditLogEntry({
            action: 'task.unblocked',
            entityId: otherTask.id,
            entityName: otherTask.title,
            entityType: 'task',
          }),
        );
      }
    }

    // Story auto-complete: if all tasks for the story are completed,
    // auto-complete the story.
    const storyTasks = allTasks.filter((t) => t.storyId === task.storyId);
    const allTasksCompleted = storyTasks.every((t) => t.status === 'completed');

    if (allTasksCompleted) {
      const story = dataStore.stories.get(task.storyId);
      if (story) {
        story.status = 'completed';
        story.updatedAt = timestamp();
        dataStore.auditLog.push(
          createMockAuditLogEntry({
            action: 'story.completed',
            entityId: story.id,
            entityName: story.title,
            entityType: 'story',
          }),
        );

        // Epic auto-complete: if all stories for the epic are completed,
        // auto-complete the epic.
        const epicStories = Array.from(dataStore.stories.values()).filter(
          (s) => s.epicId === story.epicId,
        );
        const allStoriesCompleted = epicStories.every((s) => s.status === 'completed');

        if (allStoriesCompleted) {
          const epic = dataStore.epics.get(story.epicId);
          if (epic) {
            epic.status = 'completed';
            epic.updatedAt = timestamp();
            dataStore.auditLog.push(
              createMockAuditLogEntry({
                action: 'epic.completed',
                entityId: epic.id,
                entityName: epic.title,
                entityType: 'epic',
              }),
            );

            // Project auto-complete: if all epics for the project are completed,
            // auto-complete the project.
            const projectEpics = Array.from(dataStore.epics.values()).filter(
              (e) => e.projectId === epic.projectId,
            );
            const allEpicsCompleted = projectEpics.every((e) => e.status === 'completed');

            if (allEpicsCompleted) {
              const project = dataStore.projects.get(epic.projectId);
              if (project) {
                project.status = 'completed';
                project.updatedAt = timestamp();
                dataStore.auditLog.push(
                  createMockAuditLogEntry({
                    action: 'project.completed',
                    entityId: project.id,
                    entityName: project.name,
                    entityType: 'project',
                  }),
                );
              }
            }
          }
        }
      }
    }

    return HttpResponse.json({ data: task });
  }),

  // ---- Story Completion ----

  http.post('/api/v1/stories/:id/complete', ({ params }) => {
    const id = params.id as string;
    const story = dataStore.stories.get(id);
    if (!story) return new HttpResponse(null, { status: 404 });

    story.status = 'completed';
    story.updatedAt = timestamp();

    // Clear assignment so the worker is no longer counted as active.
    story.assignedWorkerId = null;

    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'story.completed',
        entityId: id,
        entityName: story.title,
        entityType: 'story',
      }),
    );

    // Epic auto-complete: if all stories for the epic are completed,
    // auto-complete the epic.
    const epicStories = Array.from(dataStore.stories.values()).filter(
      (s) => s.epicId === story.epicId,
    );
    const allStoriesCompleted = epicStories.every((s) => s.status === 'completed');

    if (allStoriesCompleted) {
      const epic = dataStore.epics.get(story.epicId);
      if (epic) {
        epic.status = 'completed';
        epic.updatedAt = timestamp();
      }
    }

    return HttpResponse.json({ data: story });
  }),

  // ---- Dashboard Stats ----

  http.get('/api/v1/dashboard/stats', () => {
    const projects = Array.from(dataStore.projects.values());
    const stories = Array.from(dataStore.stories.values());

    const projectsByStatus = {
      draft: projects.filter((p) => p.status === 'draft').length,
      ready: projects.filter((p) => p.status === 'ready').length,
      active: projects.filter((p) => p.status === 'in-progress').length,
      completed: projects.filter((p) => p.status === 'completed').length,
    };

    // Derive active workers from in-progress story assignments.
    const activeWorkerIds = new Set(
      stories
        .filter((s) => s.status === 'in-progress' && s.assignedWorkerId)
        .map((s) => s.assignedWorkerId),
    );

    return HttpResponse.json({
      totalProjects: projects.length,
      projectsByStatus,
      activeWorkers: activeWorkerIds.size,
      totalFailures: stories.filter((s) => s.status === 'failed').length,
      totalBlocked: stories.filter((s) => s.status === 'blocked').length,
      aggregateCost: 0,
      totalTokens: 0,
    });
  }),

  // ---- Admin: Reclaim Timed-Out Stories ----

  http.post('/api/v1/admin/reclaim-timed-out', () => {
    // Find all in-progress stories and reclaim them (simulate timeout).
    const reclaimed: Array<{ storyId: string; storyName: string }> = [];

    for (const [id, story] of dataStore.stories) {
      if (story.status !== 'in-progress') continue;

      // Record the timed-out attempt.
      const worker = story.assignedWorkerId
        ? dataStore.workers.get(story.assignedWorkerId)
        : undefined;
      dataStore.attempts.push(
        createMockAttempt({
          storyId: id,
          workerId: story.assignedWorkerId ?? 'unknown',
          workerName: worker?.name ?? 'Unknown Worker',
          status: 'timed-out',
          errorMessage: null,
          startedAt: story.updatedAt,
          endedAt: timestamp(),
        }),
      );

      // Reset the story to not-started and clear worker assignment.
      story.status = 'not-started';
      story.assignedWorkerId = null;
      story.updatedAt = timestamp();
      // Also set workStatus for the UI page component.
      const storyRecord = story as unknown as Record<string, unknown>;
      storyRecord.workStatus = 'pending';

      dataStore.auditLog.push(
        createMockAuditLogEntry({
          action: 'story.timeout_reclaimed',
          entityId: id,
          entityName: story.title,
          entityType: 'story',
          metadata: { workerId: worker?.id ?? 'unknown' },
        }),
      );

      reclaimed.push({ storyId: id, storyName: story.title });
    }

    return HttpResponse.json({
      data: { checked: dataStore.stories.size, reclaimed, errors: 0 },
    });
  }),

  // ---- Audit Log ----

  http.get('/api/v1/audit-log', () => {
    return HttpResponse.json({
      data: dataStore.auditLog.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    });
  }),

  // ---- Audit Events (AuditEntryEvent shape for the audit page UI) ----

  http.get('/api/v1/audit-events', () => {
    const sorted = [...dataStore.auditLog].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const events = sorted.map((entry) => {
      const resolved = resolveProjectForEntity(entry.entityType, entry.entityId);
      return {
        eventId: entry.id,
        entityType: entry.entityType,
        entityId: entry.entityId,
        entityName: entry.entityName,
        action: entry.action,
        actorType: 'user' as const,
        actorId: entry.actorId,
        actorName: entry.actorName,
        projectId: resolved.projectId,
        projectName: resolved.projectName,
        timestamp: entry.createdAt,
        metadata: entry.metadata as Record<string, string>,
      };
    });
    // Return both `events` (for audit.tsx / project-activity-tab.tsx infinite queries)
    // and `data` (for useDashboardActivity in query-hooks.ts which accesses `data?.data`).
    return HttpResponse.json({ events, data: events });
  }),

  http.get('/api/v1/projects/:projectId/audit-events', ({ params }) => {
    const projectId = params.projectId as string;
    const project = dataStore.projects.get(projectId);
    if (!project) return new HttpResponse(null, { status: 404 });

    // Collect all entity IDs that belong to this project.
    const projectEntityIds = new Set<string>([projectId]);
    for (const [epicId, epic] of dataStore.epics) {
      if (epic.projectId === projectId) {
        projectEntityIds.add(epicId);
        for (const [storyId, story] of dataStore.stories) {
          if (story.epicId === epicId) {
            projectEntityIds.add(storyId);
            for (const [taskId, task] of dataStore.tasks) {
              if (task.storyId === storyId) {
                projectEntityIds.add(taskId);
              }
            }
          }
        }
      }
    }

    const sorted = [...dataStore.auditLog]
      .filter((entry) => projectEntityIds.has(entry.entityId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const events = sorted.map((entry) => ({
      eventId: entry.id,
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityName: entry.entityName,
      action: entry.action,
      actorType: 'user' as const,
      actorId: entry.actorId,
      actorName: entry.actorName,
      projectId,
      projectName: project.name,
      timestamp: entry.createdAt,
      metadata: entry.metadata as Record<string, string>,
    }));
    // Return both `events` (for project-activity-tab.tsx infinite query)
    // and `data` (for useProjectActivity in query-hooks.ts which accesses `data?.data`).
    return HttpResponse.json({ events, data: events });
  }),

  // ---- Project Graph (Dependency DAG) ----

  http.get('/api/v1/projects/:projectId/graph', ({ params }) => {
    const projectId = params.projectId as string;
    const project = dataStore.projects.get(projectId);
    if (!project) return new HttpResponse(null, { status: 404 });

    // Map entity factory hyphenated statuses to graph-compatible underscore format
    const mapGraphStatus = (status: string): string => status.replace(/-/g, '_');

    // Collect all entities for this project
    const projectEpics = Array.from(dataStore.epics.values()).filter(
      (e) => e.projectId === projectId,
    );
    const epicIds = new Set(projectEpics.map((e) => e.id));
    const projectStories = Array.from(dataStore.stories.values()).filter((s) =>
      epicIds.has(s.epicId),
    );
    const storyIds = new Set(projectStories.map((s) => s.id));
    const projectTasks = Array.from(dataStore.tasks.values()).filter((t) =>
      storyIds.has(t.storyId),
    );

    // Build graph nodes for all entity types
    const nodes = [
      ...projectEpics.map((e) => ({
        id: e.id,
        label: e.title,
        entityType: 'epic' as const,
        status: mapGraphStatus(e.status),
        parentName: project.name,
      })),
      ...projectStories.map((s) => {
        const epic = projectEpics.find((e) => e.id === s.epicId);
        return {
          id: s.id,
          label: s.title,
          entityType: 'story' as const,
          status: mapGraphStatus(s.status),
          epicId: s.epicId,
          epicName: epic?.title,
        };
      }),
      ...projectTasks.map((t) => {
        const story = projectStories.find((s) => s.id === t.storyId);
        const epic = story ? projectEpics.find((e) => e.id === story.epicId) : undefined;
        return {
          id: t.id,
          label: t.title,
          entityType: 'task' as const,
          status: mapGraphStatus(t.status),
          storyId: t.storyId,
          storyName: story?.title,
          epicId: epic?.id,
          epicName: epic?.title,
        };
      }),
    ];

    // Build edges from task dependency relationships
    const edges = projectTasks.flatMap((t) =>
      t.dependsOn.map((dep) => ({ source: dep, target: t.id })),
    );

    return HttpResponse.json({ nodes, edges });
  }),
];
