// Unit tests for paginated list response schemas.
// Validates the { data: [], pagination: {} } structure for each entity.

import { describe, it, expect } from 'vitest';

import {
  projectListResponseSchema,
  epicListResponseSchema,
  userStoryListResponseSchema,
  taskListResponseSchema,
  workerListResponseSchema,
  personaListResponseSchema,
} from '../list-responses';

const paginationMeta = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
} as const;

describe('list response schemas', () => {
  it('projectListResponseSchema accepts empty data array', () => {
    const result = projectListResponseSchema.safeParse({
      data: [],
      pagination: paginationMeta,
    });
    expect(result.success).toBe(true);
  });

  it('epicListResponseSchema accepts empty data array', () => {
    const result = epicListResponseSchema.safeParse({
      data: [],
      pagination: paginationMeta,
    });
    expect(result.success).toBe(true);
  });

  it('userStoryListResponseSchema accepts empty data array', () => {
    const result = userStoryListResponseSchema.safeParse({
      data: [],
      pagination: paginationMeta,
    });
    expect(result.success).toBe(true);
  });

  it('taskListResponseSchema accepts empty data array', () => {
    const result = taskListResponseSchema.safeParse({
      data: [],
      pagination: paginationMeta,
    });
    expect(result.success).toBe(true);
  });

  it('workerListResponseSchema accepts empty data array', () => {
    const result = workerListResponseSchema.safeParse({
      data: [],
      pagination: paginationMeta,
    });
    expect(result.success).toBe(true);
  });

  it('personaListResponseSchema accepts empty data array', () => {
    const result = personaListResponseSchema.safeParse({
      data: [],
      pagination: paginationMeta,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing pagination', () => {
    const result = projectListResponseSchema.safeParse({ data: [] });
    expect(result.success).toBe(false);
  });

  it('rejects missing data', () => {
    const result = projectListResponseSchema.safeParse({ pagination: paginationMeta });
    expect(result.success).toBe(false);
  });

  it('rejects invalid entity inside data array', () => {
    const result = projectListResponseSchema.safeParse({
      data: [{ invalid: true }],
      pagination: paginationMeta,
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid entity in data array', () => {
    const project = {
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
    const result = projectListResponseSchema.safeParse({
      data: [project],
      pagination: { ...paginationMeta, total: 1, totalPages: 1 },
    });
    expect(result.success).toBe(true);
  });
});
