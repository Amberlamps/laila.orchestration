// Unit tests for pagination schemas.
// Validates query coercion/defaults, response metadata, and the generic factory.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import {
  paginationQuerySchema,
  paginationResponseMetaSchema,
  paginatedResponseSchema,
  sortOrderSchema,
} from '../pagination';

describe('paginationQuerySchema (re-exported)', () => {
  it('applies all defaults for empty input', () => {
    const result = paginationQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.sortBy).toBe('createdAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('coerces string values to numbers', () => {
    const result = paginationQuerySchema.safeParse({ page: '2', limit: '10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
    }
  });
});

describe('sortOrderSchema (re-exported)', () => {
  it('accepts asc and desc', () => {
    expect(sortOrderSchema.safeParse('asc').success).toBe(true);
    expect(sortOrderSchema.safeParse('desc').success).toBe(true);
  });

  it('rejects invalid value', () => {
    expect(sortOrderSchema.safeParse('random').success).toBe(false);
  });
});

describe('paginationResponseMetaSchema', () => {
  const validMeta = {
    page: 1,
    limit: 20,
    total: 50,
    totalPages: 3,
    hasNext: true,
    hasPrev: false,
  } as const;

  it('accepts valid response metadata', () => {
    const result = paginationResponseMetaSchema.safeParse(validMeta);
    expect(result.success).toBe(true);
  });

  it('accepts zero total and totalPages', () => {
    const result = paginationResponseMetaSchema.safeParse({
      ...validMeta,
      total: 0,
      totalPages: 0,
      hasNext: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects page less than 1', () => {
    expect(paginationResponseMetaSchema.safeParse({ ...validMeta, page: 0 }).success).toBe(false);
  });

  it('rejects limit less than 1', () => {
    expect(paginationResponseMetaSchema.safeParse({ ...validMeta, limit: 0 }).success).toBe(false);
  });

  it('rejects negative total', () => {
    expect(paginationResponseMetaSchema.safeParse({ ...validMeta, total: -1 }).success).toBe(false);
  });

  it('rejects non-boolean hasNext', () => {
    expect(paginationResponseMetaSchema.safeParse({ ...validMeta, hasNext: 'yes' }).success).toBe(
      false,
    );
  });

  it('rejects missing hasNext', () => {
    const { page, limit, total, totalPages, hasPrev } = validMeta;
    expect(
      paginationResponseMetaSchema.safeParse({ page, limit, total, totalPages, hasPrev }).success,
    ).toBe(false);
  });

  it('rejects missing hasPrev', () => {
    const { page, limit, total, totalPages, hasNext } = validMeta;
    expect(
      paginationResponseMetaSchema.safeParse({ page, limit, total, totalPages, hasNext }).success,
    ).toBe(false);
  });
});

describe('paginatedResponseSchema factory', () => {
  const itemSchema = z.object({ name: z.string() });
  const paginatedSchema = paginatedResponseSchema(itemSchema);

  const validPagination = {
    page: 1,
    limit: 10,
    total: 2,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  } as const;

  it('accepts valid paginated response', () => {
    const result = paginatedSchema.safeParse({
      data: [{ name: 'Item 1' }, { name: 'Item 2' }],
      pagination: validPagination,
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty data array', () => {
    const result = paginatedSchema.safeParse({
      data: [],
      pagination: { ...validPagination, total: 0, totalPages: 0 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid item in data array', () => {
    const result = paginatedSchema.safeParse({
      data: [{ name: 123 }],
      pagination: validPagination,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing pagination', () => {
    const result = paginatedSchema.safeParse({ data: [] });
    expect(result.success).toBe(false);
  });

  it('rejects missing data', () => {
    const result = paginatedSchema.safeParse({ pagination: validPagination });
    expect(result.success).toBe(false);
  });
});
