// Unit tests for the Task entity Zod schema and TaskReference schema.
// Validates correct acceptance and rejection of input shapes.

import { describe, it, expect } from 'vitest';

import { WORK_STATUSES } from '../../constants';
import { taskSchema, taskReferenceSchema } from '../task';

const validReference = {
  type: 'doc',
  url: 'https://example.com/docs/setup',
  title: 'Setup Guide',
} as const;

const validTask = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '550e8400-e29b-41d4-a716-446655440001',
  userStoryId: '550e8400-e29b-41d4-a716-446655440002',
  title: 'Implement login form',
  description: 'Build the login form component',
  acceptanceCriteria: ['Form renders correctly', 'Validation works'],
  technicalNotes: 'Use React Hook Form',
  personaId: null,
  workStatus: 'pending',
  references: [validReference],
  version: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
} as const;

describe('taskReferenceSchema', () => {
  it('accepts a valid reference', () => {
    const result = taskReferenceSchema.safeParse(validReference);
    expect(result.success).toBe(true);
  });

  it('rejects an empty type', () => {
    const result = taskReferenceSchema.safeParse({ ...validReference, type: '' });
    expect(result.success).toBe(false);
  });

  it('rejects type exceeding 50 characters', () => {
    const result = taskReferenceSchema.safeParse({
      ...validReference,
      type: 'a'.repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid URL', () => {
    const result = taskReferenceSchema.safeParse({
      ...validReference,
      url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty title', () => {
    const result = taskReferenceSchema.safeParse({ ...validReference, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects title exceeding 255 characters', () => {
    const result = taskReferenceSchema.safeParse({
      ...validReference,
      title: 'a'.repeat(256),
    });
    expect(result.success).toBe(false);
  });
});

describe('taskSchema', () => {
  it('accepts a valid task', () => {
    const result = taskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
  });

  it('accepts null description', () => {
    const result = taskSchema.safeParse({ ...validTask, description: null });
    expect(result.success).toBe(true);
  });

  it('accepts null technicalNotes', () => {
    const result = taskSchema.safeParse({ ...validTask, technicalNotes: null });
    expect(result.success).toBe(true);
  });

  it('accepts a UUID for personaId', () => {
    const result = taskSchema.safeParse({
      ...validTask,
      personaId: '550e8400-e29b-41d4-a716-446655440099',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null personaId', () => {
    const result = taskSchema.safeParse({ ...validTask, personaId: null });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID personaId', () => {
    const result = taskSchema.safeParse({ ...validTask, personaId: 'bad' });
    expect(result.success).toBe(false);
  });

  it('accepts an empty acceptanceCriteria array', () => {
    const result = taskSchema.safeParse({ ...validTask, acceptanceCriteria: [] });
    expect(result.success).toBe(true);
  });

  it('rejects acceptanceCriteria with an empty string element', () => {
    const result = taskSchema.safeParse({
      ...validTask,
      acceptanceCriteria: ['valid', ''],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an empty references array', () => {
    const result = taskSchema.safeParse({ ...validTask, references: [] });
    expect(result.success).toBe(true);
  });

  it('rejects references with an invalid entry', () => {
    const result = taskSchema.safeParse({
      ...validTask,
      references: [{ type: '', url: 'bad', title: '' }],
    });
    expect(result.success).toBe(false);
  });

  it.each(WORK_STATUSES)('accepts workStatus "%s"', (status) => {
    const result = taskSchema.safeParse({ ...validTask, workStatus: status });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid work status', () => {
    const result = taskSchema.safeParse({ ...validTask, workStatus: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID userStoryId', () => {
    const result = taskSchema.safeParse({ ...validTask, userStoryId: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty title', () => {
    const result = taskSchema.safeParse({ ...validTask, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a negative version', () => {
    const result = taskSchema.safeParse({ ...validTask, version: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = taskSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
