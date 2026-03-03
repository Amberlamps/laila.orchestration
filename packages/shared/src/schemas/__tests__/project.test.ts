// Unit tests for the Project entity Zod schema.
// Validates correct acceptance and rejection of input shapes.

import { describe, it, expect } from 'vitest';

import { PROJECT_LIFECYCLE_STATUSES, WORK_STATUSES } from '../../constants';
import { projectSchema } from '../project';

const validProject = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Project',
  description: 'A test project description',
  lifecycleStatus: 'draft',
  workStatus: 'pending',
  workerInactivityTimeoutMinutes: 30,
  version: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
} as const;

describe('projectSchema', () => {
  it('accepts a valid project', () => {
    const result = projectSchema.safeParse(validProject);
    expect(result.success).toBe(true);
  });

  it('accepts null description', () => {
    const result = projectSchema.safeParse({ ...validProject, description: null });
    expect(result.success).toBe(true);
  });

  it('accepts a datetime for deletedAt', () => {
    const result = projectSchema.safeParse({
      ...validProject,
      deletedAt: '2026-06-01T12:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deletedAt).toBe('2026-06-01T12:00:00.000Z');
    }
  });

  it('accepts null for deletedAt', () => {
    const result = projectSchema.safeParse(validProject);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deletedAt).toBeNull();
    }
  });

  it.each(PROJECT_LIFECYCLE_STATUSES)('accepts lifecycleStatus "%s"', (status) => {
    const result = projectSchema.safeParse({ ...validProject, lifecycleStatus: status });
    expect(result.success).toBe(true);
  });

  it.each(WORK_STATUSES)('accepts workStatus "%s"', (status) => {
    const result = projectSchema.safeParse({ ...validProject, workStatus: status });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid lifecycle status', () => {
    const result = projectSchema.safeParse({
      ...validProject,
      lifecycleStatus: 'invalid_status',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid work status', () => {
    const result = projectSchema.safeParse({
      ...validProject,
      workStatus: 'invalid_status',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID id', () => {
    const result = projectSchema.safeParse({ ...validProject, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID tenantId', () => {
    const result = projectSchema.safeParse({ ...validProject, tenantId: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = projectSchema.safeParse({ ...validProject, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding 255 characters', () => {
    const result = projectSchema.safeParse({ ...validProject, name: 'a'.repeat(256) });
    expect(result.success).toBe(false);
  });

  it('rejects description exceeding 10000 characters', () => {
    const result = projectSchema.safeParse({
      ...validProject,
      description: 'a'.repeat(10001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative version', () => {
    const result = projectSchema.safeParse({ ...validProject, version: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer version', () => {
    const result = projectSchema.safeParse({ ...validProject, version: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid datetime for createdAt', () => {
    const result = projectSchema.safeParse({ ...validProject, createdAt: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = projectSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
