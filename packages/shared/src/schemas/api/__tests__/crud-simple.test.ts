// Unit tests for API create, update, and response schemas.
// Covers worker, persona CRUD and response wrappers.

import { describe, it, expect } from 'vitest';

import { epicResponseSchema } from '../epic';
import { personaResponseSchema, createPersonaSchema, updatePersonaSchema } from '../persona';
import { taskResponseSchema } from '../task';
import { userStoryResponseSchema } from '../user-story';
import { createWorkerSchema, updateWorkerSchema, workerResponseSchema } from '../worker';

// -- Worker CRUD --
describe('createWorkerSchema', () => {
  const valid = { name: 'agent-01', description: null } as const;

  it('accepts valid create payload', () => {
    expect(createWorkerSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(createWorkerSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });
});

describe('updateWorkerSchema', () => {
  it('accepts partial update with required version', () => {
    expect(updateWorkerSchema.safeParse({ name: 'new-name', version: 0 }).success).toBe(true);
  });

  it('rejects missing version', () => {
    expect(updateWorkerSchema.safeParse({ name: 'new-name' }).success).toBe(false);
  });

  it('accepts version-only update (all other fields optional)', () => {
    expect(updateWorkerSchema.safeParse({ version: 1 }).success).toBe(true);
  });
});

// -- Persona CRUD --
describe('createPersonaSchema', () => {
  const valid = { title: 'QA Engineer', description: 'Runs tests' } as const;

  it('accepts valid create payload', () => {
    expect(createPersonaSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty title', () => {
    expect(createPersonaSchema.safeParse({ ...valid, title: '' }).success).toBe(false);
  });
});

describe('updatePersonaSchema', () => {
  it('accepts partial update with required version', () => {
    expect(updatePersonaSchema.safeParse({ title: 'New Title', version: 0 }).success).toBe(true);
  });

  it('rejects missing version', () => {
    expect(updatePersonaSchema.safeParse({ title: 'New Title' }).success).toBe(false);
  });

  it('accepts version-only update (all other fields optional)', () => {
    expect(updatePersonaSchema.safeParse({ version: 2 }).success).toBe(true);
  });
});

// -- Response wrapper schemas --
describe('response wrapper schemas', () => {
  const epicData = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    tenantId: '550e8400-e29b-41d4-a716-446655440001',
    projectId: '550e8400-e29b-41d4-a716-446655440002',
    name: 'E',
    description: null,
    workStatus: 'pending',
    sortOrder: 0,
    version: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  } as const;

  it('epicResponseSchema wraps correctly', () => {
    expect(epicResponseSchema.safeParse({ data: epicData }).success).toBe(true);
  });

  it('userStoryResponseSchema rejects unwrapped data', () => {
    expect(userStoryResponseSchema.safeParse({}).success).toBe(false);
  });

  it('taskResponseSchema rejects unwrapped data', () => {
    expect(taskResponseSchema.safeParse({}).success).toBe(false);
  });

  it('workerResponseSchema rejects unwrapped data', () => {
    expect(workerResponseSchema.safeParse({}).success).toBe(false);
  });

  it('personaResponseSchema rejects unwrapped data', () => {
    expect(personaResponseSchema.safeParse({}).success).toBe(false);
  });
});
