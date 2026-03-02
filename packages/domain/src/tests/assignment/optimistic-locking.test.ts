// Exhaustive tests for optimistic locking utilities.
// Verifies version conflict detection, retry guidance generation,
// version validation, conflict response building, and nextVersion.

import { describe, it, expect } from 'vitest';

import {
  checkVersionConflict,
  generateRetryGuidance,
  nextVersion,
  buildConflictResponse,
  isValidVersion,
} from '../../assignment/optimistic-locking';

// ===========================================================================
// checkVersionConflict
// ===========================================================================
describe('checkVersionConflict', () => {
  describe('no conflict', () => {
    it('should return no conflict when versions match', () => {
      const result = checkVersionConflict(1, 1);

      expect(result.conflict).toBe(false);
    });

    it('should return no conflict for large matching versions', () => {
      const result = checkVersionConflict(999, 999);

      expect(result.conflict).toBe(false);
    });
  });

  describe('conflict detection', () => {
    it('should detect conflict when actual version is ahead of expected', () => {
      const result = checkVersionConflict(1, 3);

      expect(result.conflict).toBe(true);
      if (result.conflict) {
        expect(result.expectedVersion).toBe(1);
        expect(result.actualVersion).toBe(3);
        expect(result.message).toContain('1');
        expect(result.message).toContain('3');
      }
    });

    it('should detect conflict when actual version is behind expected', () => {
      const result = checkVersionConflict(5, 3);

      expect(result.conflict).toBe(true);
      if (result.conflict) {
        expect(result.expectedVersion).toBe(5);
        expect(result.actualVersion).toBe(3);
      }
    });

    it('should detect conflict for single-version gap', () => {
      const result = checkVersionConflict(1, 2);

      expect(result.conflict).toBe(true);
      if (result.conflict) {
        expect(result.expectedVersion).toBe(1);
        expect(result.actualVersion).toBe(2);
      }
    });

    it('should include retry guidance in conflict result', () => {
      const result = checkVersionConflict(1, 3);

      expect(result.conflict).toBe(true);
      if (result.conflict) {
        expect(result.retryGuidance).toBeDefined();
        expect(result.retryGuidance.strategy).toBeDefined();
        expect(result.retryGuidance.shouldRetry).toBeDefined();
        expect(result.retryGuidance.explanation).toBeDefined();
      }
    });

    it('should include a human-readable message in conflict result', () => {
      const result = checkVersionConflict(2, 5);

      expect(result.conflict).toBe(true);
      if (result.conflict) {
        expect(result.message).toContain('Version conflict');
        expect(result.message).toContain('2');
        expect(result.message).toContain('5');
      }
    });
  });
});

// ===========================================================================
// generateRetryGuidance
// ===========================================================================
describe('generateRetryGuidance', () => {
  describe('small version gaps (1-2)', () => {
    it('should recommend refetch-and-retry for gap of 1', () => {
      const guidance = generateRetryGuidance(1, 2);

      expect(guidance.shouldRetry).toBe(true);
      expect(guidance.strategy).toBe('refetch-and-retry');
      expect(guidance.explanation).toContain('1 time');
    });

    it('should recommend refetch-and-retry for gap of 2', () => {
      const guidance = generateRetryGuidance(3, 5);

      expect(guidance.shouldRetry).toBe(true);
      expect(guidance.strategy).toBe('refetch-and-retry');
      expect(guidance.explanation).toContain('2 time');
    });
  });

  describe('large version gaps (>2)', () => {
    it('should recommend refetch-and-retry with staleness warning for gap of 3', () => {
      const guidance = generateRetryGuidance(1, 4);

      expect(guidance.shouldRetry).toBe(true);
      expect(guidance.strategy).toBe('refetch-and-retry');
      expect(guidance.explanation).toContain('out of date');
    });

    it('should recommend refetch-and-retry with staleness warning for large gap', () => {
      const guidance = generateRetryGuidance(1, 10);

      expect(guidance.shouldRetry).toBe(true);
      expect(guidance.strategy).toBe('refetch-and-retry');
      expect(guidance.explanation).toContain('out of date');
      expect(guidance.explanation).toContain('9 times');
    });

    it('should recommend refetch-and-retry for very large gap', () => {
      const guidance = generateRetryGuidance(1, 100);

      expect(guidance.shouldRetry).toBe(true);
      expect(guidance.strategy).toBe('refetch-and-retry');
    });
  });

  describe('invalid version state (actual <= expected)', () => {
    it('should recommend abort when actual is less than expected', () => {
      const guidance = generateRetryGuidance(5, 3);

      expect(guidance.shouldRetry).toBe(false);
      expect(guidance.strategy).toBe('abort');
      expect(guidance.explanation).toContain('Unexpected');
    });

    it('should recommend abort when versions are equal (gap = 0)', () => {
      const guidance = generateRetryGuidance(5, 5);

      expect(guidance.shouldRetry).toBe(false);
      expect(guidance.strategy).toBe('abort');
    });

    it('should mention data corruption in explanation for invalid state', () => {
      const guidance = generateRetryGuidance(10, 5);

      expect(guidance.explanation).toContain('corruption');
    });
  });
});

// ===========================================================================
// nextVersion
// ===========================================================================
describe('nextVersion', () => {
  it('should increment version by 1', () => {
    expect(nextVersion(1)).toBe(2);
  });

  it('should work for large version numbers', () => {
    expect(nextVersion(999)).toBe(1000);
  });

  it('should work for version 0', () => {
    expect(nextVersion(0)).toBe(1);
  });
});

// ===========================================================================
// isValidVersion
// ===========================================================================
describe('isValidVersion', () => {
  describe('valid versions', () => {
    it('should accept 1', () => {
      expect(isValidVersion(1)).toBe(true);
    });

    it('should accept large positive integers', () => {
      expect(isValidVersion(100)).toBe(true);
      expect(isValidVersion(999999)).toBe(true);
    });
  });

  describe('invalid versions', () => {
    it('should reject zero', () => {
      expect(isValidVersion(0)).toBe(false);
    });

    it('should reject negative numbers', () => {
      expect(isValidVersion(-1)).toBe(false);
      expect(isValidVersion(-100)).toBe(false);
    });

    it('should reject floats', () => {
      expect(isValidVersion(1.5)).toBe(false);
      expect(isValidVersion(0.1)).toBe(false);
    });

    it('should reject string numbers', () => {
      expect(isValidVersion('1')).toBe(false);
      expect(isValidVersion('100')).toBe(false);
    });

    it('should reject null', () => {
      expect(isValidVersion(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isValidVersion(undefined)).toBe(false);
    });

    it('should reject NaN', () => {
      expect(isValidVersion(NaN)).toBe(false);
    });

    it('should reject Infinity', () => {
      expect(isValidVersion(Infinity)).toBe(false);
      expect(isValidVersion(-Infinity)).toBe(false);
    });

    it('should reject boolean', () => {
      expect(isValidVersion(true)).toBe(false);
      expect(isValidVersion(false)).toBe(false);
    });

    it('should reject objects', () => {
      expect(isValidVersion({})).toBe(false);
      expect(isValidVersion([])).toBe(false);
    });
  });
});

// ===========================================================================
// buildConflictResponse
// ===========================================================================
describe('buildConflictResponse', () => {
  it('should produce a well-structured 409 error response', () => {
    const conflictResult = checkVersionConflict(1, 3);
    if (!conflictResult.conflict) throw new Error('Expected conflict');

    const response = buildConflictResponse('user-story', 'story-1', conflictResult);

    expect(response.error.code).toBe('VERSION_CONFLICT');
    expect(response.error.message).toContain('Version conflict');
    expect(response.error.details.entityType).toBe('user-story');
    expect(response.error.details.entityId).toBe('story-1');
    expect(response.error.details.expectedVersion).toBe(1);
    expect(response.error.details.actualVersion).toBe(3);
    expect(response.error.details.retryGuidance).toBeDefined();
  });

  it('should include retry guidance from the conflict result', () => {
    const conflictResult = checkVersionConflict(1, 2);
    if (!conflictResult.conflict) throw new Error('Expected conflict');

    const response = buildConflictResponse('task', 'task-42', conflictResult);

    expect(response.error.details.retryGuidance.shouldRetry).toBe(true);
    expect(response.error.details.retryGuidance.strategy).toBe('refetch-and-retry');
  });

  it('should handle different entity types', () => {
    const conflictResult = checkVersionConflict(2, 5);
    if (!conflictResult.conflict) throw new Error('Expected conflict');

    const response = buildConflictResponse('epic', 'epic-7', conflictResult);

    expect(response.error.details.entityType).toBe('epic');
    expect(response.error.details.entityId).toBe('epic-7');
  });

  it('should preserve exact version numbers from the conflict', () => {
    const conflictResult = checkVersionConflict(10, 15);
    if (!conflictResult.conflict) throw new Error('Expected conflict');

    const response = buildConflictResponse('project', 'proj-1', conflictResult);

    expect(response.error.details.expectedVersion).toBe(10);
    expect(response.error.details.actualVersion).toBe(15);
  });
});

// ===========================================================================
// Pure function guarantees
// ===========================================================================
describe('pure function guarantees', () => {
  it('checkVersionConflict returns identical results for same inputs', () => {
    const result1 = checkVersionConflict(1, 3);
    const result2 = checkVersionConflict(1, 3);

    expect(result1).toEqual(result2);
  });

  it('generateRetryGuidance returns identical results for same inputs', () => {
    const guidance1 = generateRetryGuidance(1, 5);
    const guidance2 = generateRetryGuidance(1, 5);

    expect(guidance1).toEqual(guidance2);
  });
});
