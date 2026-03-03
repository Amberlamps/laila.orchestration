// Unit tests for the work assignment discriminated union response schema.
// Validates all three variants: assigned, blocked, all_complete.

import { describe, it, expect } from 'vitest';

import { workAssignmentResponseSchema } from '../work-assignment';

const validUserStory = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '550e8400-e29b-41d4-a716-446655440001',
  epicId: '550e8400-e29b-41d4-a716-446655440002',
  title: 'Story',
  description: null,
  priority: 'medium',
  workStatus: 'in_progress',
  costEstimate: null,
  actualCost: null,
  assignedWorkerId: '550e8400-e29b-41d4-a716-446655440010',
  assignedAt: '2026-03-01T10:00:00.000Z',
  attempts: 1,
  maxAttempts: 3,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  deletedAt: null,
} as const;

const validTask = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  tenantId: '550e8400-e29b-41d4-a716-446655440001',
  userStoryId: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Task 1',
  description: null,
  acceptanceCriteria: ['Criterion'],
  technicalNotes: null,
  personaId: null,
  workStatus: 'pending',
  startedAt: null,
  completedAt: null,
  references: [],
  version: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
} as const;

describe('workAssignmentResponseSchema', () => {
  describe('assigned variant', () => {
    const assigned = {
      type: 'assigned',
      userStory: validUserStory,
      tasks: [validTask],
      assignedAt: '2026-03-01T10:00:00.000Z',
    } as const;

    it('accepts a valid assigned response', () => {
      const result = workAssignmentResponseSchema.safeParse(assigned);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('assigned');
      }
    });

    it('accepts assigned with empty tasks array', () => {
      const result = workAssignmentResponseSchema.safeParse({
        ...assigned,
        tasks: [],
      });
      expect(result.success).toBe(true);
    });

    it('rejects assigned with invalid assignedAt', () => {
      const result = workAssignmentResponseSchema.safeParse({
        ...assigned,
        assignedAt: 'bad-date',
      });
      expect(result.success).toBe(false);
    });

    it('rejects assigned missing userStory', () => {
      const result = workAssignmentResponseSchema.safeParse({
        type: assigned.type,
        tasks: assigned.tasks,
        assignedAt: assigned.assignedAt,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('blocked variant', () => {
    const blocked = {
      type: 'blocked',
      reason: 'Dependencies are unresolved',
      blockedCount: 5,
    } as const;

    it('accepts a valid blocked response', () => {
      const result = workAssignmentResponseSchema.safeParse(blocked);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('blocked');
      }
    });

    it('accepts blockedCount of zero', () => {
      const result = workAssignmentResponseSchema.safeParse({
        ...blocked,
        blockedCount: 0,
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative blockedCount', () => {
      const result = workAssignmentResponseSchema.safeParse({
        ...blocked,
        blockedCount: -1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects blocked missing reason', () => {
      const result = workAssignmentResponseSchema.safeParse({
        type: blocked.type,
        blockedCount: blocked.blockedCount,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('all_complete variant', () => {
    const allComplete = {
      type: 'all_complete',
      completedAt: '2026-03-02T12:00:00.000Z',
    } as const;

    it('accepts a valid all_complete response', () => {
      const result = workAssignmentResponseSchema.safeParse(allComplete);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('all_complete');
      }
    });

    it('rejects all_complete with invalid datetime', () => {
      const result = workAssignmentResponseSchema.safeParse({
        ...allComplete,
        completedAt: 'not-a-date',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('discriminator validation', () => {
    it('rejects an unknown type discriminator', () => {
      const result = workAssignmentResponseSchema.safeParse({
        type: 'unknown',
        data: 'something',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing type discriminator', () => {
      const result = workAssignmentResponseSchema.safeParse({
        reason: 'no type field',
      });
      expect(result.success).toBe(false);
    });
  });
});
