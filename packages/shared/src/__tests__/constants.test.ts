import { describe, it, expect } from 'vitest';

import {
  projectLifecycleStatusSchema,
  PROJECT_LIFECYCLE_STATUSES,
  workStatusSchema,
  WORK_STATUSES,
  prioritySchema,
  PRIORITIES,
  errorCodeSchema,
  ERROR_CODES,
  API_KEY_PREFIX,
  API_VERSION,
  DEFAULT_PAGINATION_LIMIT,
  MAX_PAGINATION_LIMIT,
} from '../constants';

describe('status constants', () => {
  it('should validate project lifecycle statuses', () => {
    const statuses = ['draft', 'planning', 'ready', 'active', 'completed', 'archived'] as const;
    for (const status of statuses) {
      expect(projectLifecycleStatusSchema.parse(status)).toBe(status);
    }
    expect(PROJECT_LIFECYCLE_STATUSES).toEqual(statuses);
  });

  it('should reject invalid project lifecycle status', () => {
    const result = projectLifecycleStatusSchema.safeParse('invalid');
    expect(result.success).toBe(false);
  });

  it('should validate work statuses', () => {
    const statuses = [
      'pending',
      'blocked',
      'ready',
      'in_progress',
      'review',
      'done',
      'failed',
      'skipped',
    ] as const;
    for (const status of statuses) {
      expect(workStatusSchema.parse(status)).toBe(status);
    }
    expect(WORK_STATUSES).toEqual(statuses);
  });

  it('should reject invalid work status', () => {
    const result = workStatusSchema.safeParse('invalid');
    expect(result.success).toBe(false);
  });
});

describe('priority constants', () => {
  it('should validate priority levels', () => {
    const priorities = ['critical', 'high', 'medium', 'low'] as const;
    for (const priority of priorities) {
      expect(prioritySchema.parse(priority)).toBe(priority);
    }
    expect(PRIORITIES).toEqual(priorities);
  });

  it('should reject invalid priority', () => {
    const result = prioritySchema.safeParse('urgent');
    expect(result.success).toBe(false);
  });
});

describe('error code constants', () => {
  it('should validate error codes follow CATEGORY_SPECIFIC naming', () => {
    for (const code of ERROR_CODES) {
      expect(code).toMatch(/^[A-Z]+_[A-Z_]+$/);
    }
  });

  it('should include all required error categories', () => {
    const categories = [
      'VALIDATION',
      'AUTH',
      'AUTHZ',
      'NOT_FOUND',
      'CONFLICT',
      'DEPENDENCY',
      'RATE_LIMIT',
      'INTERNAL',
    ];
    for (const category of categories) {
      const hasCategory = ERROR_CODES.some((code) => code.startsWith(`${category}_`));
      expect(hasCategory).toBe(true);
    }
  });

  it('should validate specific error codes', () => {
    expect(errorCodeSchema.parse('CONFLICT_VERSION_MISMATCH')).toBe('CONFLICT_VERSION_MISMATCH');
    expect(errorCodeSchema.parse('DEPENDENCY_CYCLE_DETECTED')).toBe('DEPENDENCY_CYCLE_DETECTED');
    expect(errorCodeSchema.parse('DEPENDENCY_UNRESOLVED')).toBe('DEPENDENCY_UNRESOLVED');
  });

  it('should reject invalid error code', () => {
    const result = errorCodeSchema.safeParse('UNKNOWN_ERROR');
    expect(result.success).toBe(false);
  });
});

describe('API constants', () => {
  it('should export correct API key prefix', () => {
    expect(API_KEY_PREFIX).toBe('lw_');
  });

  it('should export correct API version', () => {
    expect(API_VERSION).toBe('v1');
  });

  it('should export pagination defaults', () => {
    expect(DEFAULT_PAGINATION_LIMIT).toBe(20);
    expect(MAX_PAGINATION_LIMIT).toBe(100);
    expect(MAX_PAGINATION_LIMIT).toBeGreaterThan(DEFAULT_PAGINATION_LIMIT);
  });
});
