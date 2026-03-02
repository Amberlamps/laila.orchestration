// Unit tests for the Epic entity Zod schema.
// Validates correct acceptance and rejection of input shapes.

import { describe, it, expect } from 'vitest';

import { WORK_STATUSES } from '../../constants';
import { epicSchema } from '../epic';

const validEpic = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '550e8400-e29b-41d4-a716-446655440001',
  projectId: '550e8400-e29b-41d4-a716-446655440002',
  name: 'Test Epic',
  description: 'An epic description',
  workStatus: 'pending',
  sortOrder: 0,
  version: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
} as const;

describe('epicSchema', () => {
  it('accepts a valid epic', () => {
    const result = epicSchema.safeParse(validEpic);
    expect(result.success).toBe(true);
  });

  it('accepts null description', () => {
    const result = epicSchema.safeParse({ ...validEpic, description: null });
    expect(result.success).toBe(true);
  });

  it('accepts a datetime for deletedAt', () => {
    const result = epicSchema.safeParse({
      ...validEpic,
      deletedAt: '2026-06-01T12:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null for deletedAt', () => {
    const result = epicSchema.safeParse(validEpic);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deletedAt).toBeNull();
    }
  });

  it.each(WORK_STATUSES)('accepts workStatus "%s"', (status) => {
    const result = epicSchema.safeParse({ ...validEpic, workStatus: status });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid work status', () => {
    const result = epicSchema.safeParse({ ...validEpic, workStatus: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID projectId', () => {
    const result = epicSchema.safeParse({ ...validEpic, projectId: 'not-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = epicSchema.safeParse({ ...validEpic, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding 255 characters', () => {
    const result = epicSchema.safeParse({ ...validEpic, name: 'x'.repeat(256) });
    expect(result.success).toBe(false);
  });

  it('rejects description exceeding 10000 characters', () => {
    const result = epicSchema.safeParse({
      ...validEpic,
      description: 'x'.repeat(10001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative sortOrder', () => {
    const result = epicSchema.safeParse({ ...validEpic, sortOrder: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer sortOrder', () => {
    const result = epicSchema.safeParse({ ...validEpic, sortOrder: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative version', () => {
    const result = epicSchema.safeParse({ ...validEpic, version: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid datetime for updatedAt', () => {
    const result = epicSchema.safeParse({ ...validEpic, updatedAt: 'bad-date' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = epicSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
