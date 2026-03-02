// Unit tests for list query schemas and pagination metadata.
// Validates coercion, defaults, filters, and pagination meta.

import { describe, it, expect } from 'vitest';

import { DEFAULT_PAGINATION_LIMIT, MAX_PAGINATION_LIMIT } from '../../../constants/api';
import {
  paginationQuerySchema,
  paginationMetaSchema,
  sortOrderSchema,
  listProjectsQuerySchema,
  listEpicsQuerySchema,
  listUserStoriesQuerySchema,
  listTasksQuerySchema,
  listWorkersQuerySchema,
  listPersonasQuerySchema,
} from '../list-queries';

describe('sortOrderSchema', () => {
  it('accepts "asc"', () => {
    expect(sortOrderSchema.safeParse('asc').success).toBe(true);
  });

  it('accepts "desc"', () => {
    expect(sortOrderSchema.safeParse('desc').success).toBe(true);
  });

  it('rejects invalid sort order', () => {
    expect(sortOrderSchema.safeParse('ascending').success).toBe(false);
  });
});

describe('paginationQuerySchema', () => {
  it('applies defaults when empty object is provided', () => {
    const result = paginationQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(DEFAULT_PAGINATION_LIMIT);
      expect(result.data.sortBy).toBe('createdAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('coerces string page to number', () => {
    const result = paginationQuerySchema.safeParse({ page: '3' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
    }
  });

  it('coerces string limit to number', () => {
    const result = paginationQuerySchema.safeParse({ limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects page less than 1', () => {
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('rejects negative page', () => {
    expect(paginationQuerySchema.safeParse({ page: -1 }).success).toBe(false);
  });

  it('rejects limit less than 1', () => {
    expect(paginationQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('rejects limit exceeding MAX_PAGINATION_LIMIT', () => {
    expect(paginationQuerySchema.safeParse({ limit: MAX_PAGINATION_LIMIT + 1 }).success).toBe(
      false,
    );
  });

  it('accepts limit at MAX_PAGINATION_LIMIT', () => {
    const result = paginationQuerySchema.safeParse({ limit: MAX_PAGINATION_LIMIT });
    expect(result.success).toBe(true);
  });
});

describe('paginationMetaSchema', () => {
  const validMeta = {
    page: 1,
    limit: 20,
    total: 100,
    totalPages: 5,
    hasNext: true,
    hasPrev: false,
  } as const;

  it('accepts valid pagination metadata', () => {
    expect(paginationMetaSchema.safeParse(validMeta).success).toBe(true);
  });

  it('accepts zero total', () => {
    expect(
      paginationMetaSchema.safeParse({ ...validMeta, total: 0, totalPages: 0, hasNext: false })
        .success,
    ).toBe(true);
  });

  it('rejects negative total', () => {
    expect(paginationMetaSchema.safeParse({ ...validMeta, total: -1 }).success).toBe(false);
  });

  it('rejects page less than 1', () => {
    expect(paginationMetaSchema.safeParse({ ...validMeta, page: 0 }).success).toBe(false);
  });

  it('rejects missing hasNext', () => {
    const { page, limit, total, totalPages, hasPrev } = validMeta;
    expect(
      paginationMetaSchema.safeParse({ page, limit, total, totalPages, hasPrev }).success,
    ).toBe(false);
  });

  it('rejects missing hasPrev', () => {
    const { page, limit, total, totalPages, hasNext } = validMeta;
    expect(
      paginationMetaSchema.safeParse({ page, limit, total, totalPages, hasNext }).success,
    ).toBe(false);
  });
});

describe('listProjectsQuerySchema', () => {
  it('accepts without filter', () => {
    expect(listProjectsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts valid lifecycle status filter', () => {
    const result = listProjectsQuerySchema.safeParse({ status: 'active' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid lifecycle status', () => {
    expect(listProjectsQuerySchema.safeParse({ status: 'invalid' }).success).toBe(false);
  });
});

describe('listEpicsQuerySchema', () => {
  it('accepts projectId filter', () => {
    const result = listEpicsQuerySchema.safeParse({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts status and priority filters', () => {
    const result = listEpicsQuerySchema.safeParse({ status: 'pending', priority: 'high' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid projectId', () => {
    expect(listEpicsQuerySchema.safeParse({ projectId: 'bad' }).success).toBe(false);
  });
});

describe('listUserStoriesQuerySchema', () => {
  it('accepts projectId and epicId filters', () => {
    const result = listUserStoriesQuerySchema.safeParse({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      epicId: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(true);
  });
});

describe('listTasksQuerySchema', () => {
  it('accepts all filter combinations', () => {
    const result = listTasksQuerySchema.safeParse({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      epicId: '550e8400-e29b-41d4-a716-446655440001',
      userStoryId: '550e8400-e29b-41d4-a716-446655440002',
      status: 'in_progress',
      priority: 'critical',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid userStoryId', () => {
    expect(listTasksQuerySchema.safeParse({ userStoryId: 'not-uuid' }).success).toBe(false);
  });
});

describe('listWorkersQuerySchema', () => {
  it('accepts isActive filter (true)', () => {
    const result = listWorkersQuerySchema.safeParse({ isActive: true });
    expect(result.success).toBe(true);
  });

  it('accepts isActive filter (false)', () => {
    const result = listWorkersQuerySchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
  });

  it('coerces string isActive to boolean', () => {
    const result = listWorkersQuerySchema.safeParse({ isActive: 'true' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });

  it('accepts without filter', () => {
    expect(listWorkersQuerySchema.safeParse({}).success).toBe(true);
  });
});

describe('listPersonasQuerySchema', () => {
  it('applies defaults', () => {
    const result = listPersonasQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
    }
  });
});
