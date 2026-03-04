// Factory functions for generating type-safe test entities.
// Each factory produces a complete entity with sensible defaults
// that can be overridden via partial input.
//
// Uses the global `crypto.randomUUID()` API (available in both
// Node.js 19+ and all modern browsers) so this module works in
// the browser MSW context as well as Node.js test runners.

// ---- Entity Types ----

type EntityStatus =
  | 'draft'
  | 'not-started'
  | 'blocked'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'ready';

export interface MockProject {
  id: string;
  name: string;
  description: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
}

export interface MockEpic {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MockStory {
  id: string;
  epicId: string;
  title: string;
  description: string;
  status: EntityStatus;
  assignedWorkerId: string | null;
  errorMessage: string | null;
  failedTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MockTask {
  id: string;
  storyId: string;
  title: string;
  description: string;
  status: EntityStatus;
  personaId: string;
  acceptanceCriteria: string[];
  dependsOn: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MockWorker {
  id: string;
  name: string;
  apiKeyPrefix: string;
  status: 'active' | 'inactive';
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MockPersona {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface MockAttempt {
  id: string;
  storyId: string;
  workerId: string;
  workerName: string;
  status: 'completed' | 'failed' | 'timed-out' | 'manual';
  errorMessage: string | null;
  startedAt: string;
  endedAt: string;
}

export interface MockAuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorName: string;
  entityId: string;
  entityName: string;
  entityType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ---- Factory Functions ----

const now = (): string => new Date().toISOString();

export const createMockProject = (overrides: Partial<MockProject> = {}): MockProject => ({
  id: crypto.randomUUID(),
  name: 'Test Project',
  description: 'A test project for E2E testing',
  status: 'draft',
  createdAt: now(),
  updatedAt: now(),
  ownerId: 'test-user-001',
  ...overrides,
});

export const createMockEpic = (overrides: Partial<MockEpic> = {}): MockEpic => ({
  id: crypto.randomUUID(),
  projectId: 'default-project-id',
  title: 'Test Epic',
  description: 'A test epic for E2E testing',
  status: 'draft',
  createdAt: now(),
  updatedAt: now(),
  ...overrides,
});

export const createMockStory = (overrides: Partial<MockStory> = {}): MockStory => ({
  id: crypto.randomUUID(),
  epicId: 'default-epic-id',
  title: 'Test Story',
  description: 'A test story for E2E testing',
  status: 'draft',
  assignedWorkerId: null,
  errorMessage: null,
  failedTaskId: null,
  createdAt: now(),
  updatedAt: now(),
  ...overrides,
});

export const createMockTask = (overrides: Partial<MockTask> = {}): MockTask => ({
  id: crypto.randomUUID(),
  storyId: 'default-story-id',
  title: 'Test Task',
  description: 'A test task for E2E testing',
  status: 'draft',
  personaId: 'default-persona-id',
  acceptanceCriteria: ['Task output is verified'],
  dependsOn: [],
  createdAt: now(),
  updatedAt: now(),
  ...overrides,
});

export const createMockWorker = (overrides: Partial<MockWorker> = {}): MockWorker => ({
  id: crypto.randomUUID(),
  name: 'Test Worker',
  apiKeyPrefix: 'lw_test',
  status: 'active',
  projectIds: [],
  createdAt: now(),
  updatedAt: now(),
  ...overrides,
});

export const createMockPersona = (overrides: Partial<MockPersona> = {}): MockPersona => ({
  id: crypto.randomUUID(),
  title: 'Test Persona',
  description: 'A test persona for E2E testing',
  createdAt: now(),
  updatedAt: now(),
  ...overrides,
});

export const createMockAttempt = (overrides: Partial<MockAttempt> = {}): MockAttempt => ({
  id: crypto.randomUUID(),
  storyId: 'default-story-id',
  workerId: 'default-worker-id',
  workerName: 'Test Worker',
  status: 'failed',
  errorMessage: null,
  startedAt: now(),
  endedAt: now(),
  ...overrides,
});

export const createMockAuditLogEntry = (
  overrides: Partial<MockAuditLogEntry> = {},
): MockAuditLogEntry => ({
  id: crypto.randomUUID(),
  action: 'entity.created',
  actorId: 'test-user-001',
  actorName: 'E2E Test User',
  entityId: 'default-entity-id',
  entityName: 'Test Entity',
  entityType: 'project',
  metadata: {},
  createdAt: now(),
  ...overrides,
});

// ---- Composite Factories ----

export const createMockProjectPlan = () => {
  const persona = createMockPersona({ title: 'Backend Developer' });
  const project = createMockProject({
    name: 'E2E Test Plan',
    status: 'ready',
  });
  const epic = createMockEpic({
    projectId: project.id,
    title: 'Core Feature Epic',
    status: 'ready',
  });
  const story = createMockStory({
    epicId: epic.id,
    title: 'Implement Feature',
    status: 'not-started',
  });

  const task1 = createMockTask({
    storyId: story.id,
    title: 'Setup Database Schema',
    personaId: persona.id,
    status: 'not-started',
    dependsOn: [],
  });
  const task2 = createMockTask({
    storyId: story.id,
    title: 'Implement API Endpoint',
    personaId: persona.id,
    status: 'blocked',
    dependsOn: [task1.id],
  });
  const task3 = createMockTask({
    storyId: story.id,
    title: 'Write Integration Tests',
    personaId: persona.id,
    status: 'blocked',
    dependsOn: [task2.id],
  });

  return { project, epic, story, tasks: [task1, task2, task3], persona };
};
