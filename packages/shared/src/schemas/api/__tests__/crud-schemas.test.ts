// Unit tests for API create, update, and response schemas.
// Covers project, epic, user-story, and task CRUD schemas (with optimistic locking).

import { describe, it, expect } from 'vitest';

import { createEpicSchema, updateEpicSchema } from '../epic';
import { createProjectSchema, updateProjectSchema, projectResponseSchema } from '../project';
import { createTaskSchema, updateTaskSchema } from '../task';
import { createUserStorySchema, updateUserStorySchema } from '../user-story';

// -- Project CRUD --
describe('createProjectSchema', () => {
  const valid = { name: 'My Project', description: null, lifecycleStatus: 'draft' } as const;

  it('accepts valid create payload', () => {
    expect(createProjectSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(createProjectSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('strips auto-generated fields from output', () => {
    const result = createProjectSchema.safeParse({
      ...valid,
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('id' in result.data).toBe(false);
    }
  });
});

describe('updateProjectSchema', () => {
  it('accepts partial update with version', () => {
    expect(updateProjectSchema.safeParse({ version: 1, name: 'Updated' }).success).toBe(true);
  });

  it('requires version field', () => {
    expect(updateProjectSchema.safeParse({ name: 'Updated' }).success).toBe(false);
  });

  it('accepts version-only payload', () => {
    expect(updateProjectSchema.safeParse({ version: 0 }).success).toBe(true);
  });
});

describe('projectResponseSchema', () => {
  const fullProject = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    tenantId: '550e8400-e29b-41d4-a716-446655440001',
    name: 'P',
    description: null,
    lifecycleStatus: 'draft',
    workStatus: 'pending',
    workerInactivityTimeoutMinutes: 30,
    version: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  } as const;

  it('accepts wrapped project', () => {
    expect(projectResponseSchema.safeParse({ data: fullProject }).success).toBe(true);
  });

  it('rejects missing data wrapper', () => {
    expect(projectResponseSchema.safeParse(fullProject).success).toBe(false);
  });
});

// -- Epic CRUD --
describe('createEpicSchema', () => {
  const valid = {
    projectId: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Epic',
    description: null,
    sortOrder: 0,
  } as const;

  it('accepts valid create payload', () => {
    expect(createEpicSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing projectId', () => {
    const result = createEpicSchema.safeParse({
      name: valid.name,
      description: valid.description,
      sortOrder: valid.sortOrder,
    });
    expect(result.success).toBe(false);
  });
});

describe('updateEpicSchema', () => {
  it('accepts partial update with version', () => {
    expect(updateEpicSchema.safeParse({ version: 2, name: 'New' }).success).toBe(true);
  });

  it('requires version', () => {
    expect(updateEpicSchema.safeParse({ name: 'New' }).success).toBe(false);
  });
});

// -- User Story CRUD --
describe('createUserStorySchema', () => {
  const valid = {
    epicId: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Story',
    description: null,
    priority: 'medium',
    costEstimate: null,
    maxAttempts: 3,
  } as const;

  it('accepts valid create payload', () => {
    expect(createUserStorySchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing epicId', () => {
    const result = createUserStorySchema.safeParse({
      title: valid.title,
      description: valid.description,
      priority: valid.priority,
      costEstimate: valid.costEstimate,
      maxAttempts: valid.maxAttempts,
    });
    expect(result.success).toBe(false);
  });

  it('strips auto-generated assignment fields from output', () => {
    const result = createUserStorySchema.safeParse({
      ...valid,
      assignedWorkerId: '550e8400-e29b-41d4-a716-446655440099',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('assignedWorkerId' in result.data).toBe(false);
    }
  });
});

describe('updateUserStorySchema', () => {
  it('accepts partial update with version', () => {
    expect(updateUserStorySchema.safeParse({ version: 0, title: 'New' }).success).toBe(true);
  });

  it('requires version', () => {
    expect(updateUserStorySchema.safeParse({ title: 'New' }).success).toBe(false);
  });
});

// -- Task CRUD --
describe('createTaskSchema', () => {
  const valid = {
    userStoryId: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Task',
    description: null,
    acceptanceCriteria: ['Done'],
    technicalNotes: null,
    personaId: null,
    references: [],
  } as const;

  it('accepts valid create payload', () => {
    expect(createTaskSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing userStoryId', () => {
    const result = createTaskSchema.safeParse({
      title: valid.title,
      description: valid.description,
      acceptanceCriteria: valid.acceptanceCriteria,
      technicalNotes: valid.technicalNotes,
      personaId: valid.personaId,
      references: valid.references,
    });
    expect(result.success).toBe(false);
  });
});

describe('updateTaskSchema', () => {
  it('accepts partial update with version', () => {
    expect(updateTaskSchema.safeParse({ version: 1, title: 'New' }).success).toBe(true);
  });

  it('requires version', () => {
    expect(updateTaskSchema.safeParse({ title: 'New' }).success).toBe(false);
  });
});
