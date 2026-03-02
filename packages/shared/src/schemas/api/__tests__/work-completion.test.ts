// Unit tests for the work completion request schema.
// Validates status reporting, cost tracking, and refinement logic.

import { describe, it, expect } from 'vitest';

import { workCompletionRequestSchema, workCompletionStatusSchema } from '../work-completion';

describe('workCompletionStatusSchema', () => {
  it.each(['done', 'failed'] as const)('accepts status "%s"', (status) => {
    expect(workCompletionStatusSchema.safeParse(status).success).toBe(true);
  });

  it('rejects invalid status', () => {
    expect(workCompletionStatusSchema.safeParse('cancelled').success).toBe(false);
  });
});

describe('workCompletionRequestSchema', () => {
  const validDone = {
    userStoryId: '550e8400-e29b-41d4-a716-446655440000',
    status: 'done',
    cost: 150.5,
  } as const;

  const validFailed = {
    userStoryId: '550e8400-e29b-41d4-a716-446655440000',
    status: 'failed',
    cost: 42,
    reason: 'Compilation error in module X',
  } as const;

  it('accepts a valid done completion', () => {
    const result = workCompletionRequestSchema.safeParse(validDone);
    expect(result.success).toBe(true);
  });

  it('accepts done with optional reason', () => {
    const result = workCompletionRequestSchema.safeParse({
      ...validDone,
      reason: 'All tests passed',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid failed completion with reason', () => {
    const result = workCompletionRequestSchema.safeParse(validFailed);
    expect(result.success).toBe(true);
  });

  it('rejects failed completion without reason', () => {
    const result = workCompletionRequestSchema.safeParse({
      userStoryId: validFailed.userStoryId,
      status: validFailed.status,
      cost: validFailed.cost,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative cost', () => {
    const result = workCompletionRequestSchema.safeParse({ ...validDone, cost: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts zero cost', () => {
    const result = workCompletionRequestSchema.safeParse({ ...validDone, cost: 0 });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID userStoryId', () => {
    const result = workCompletionRequestSchema.safeParse({
      ...validDone,
      userStoryId: 'bad',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty reason string', () => {
    const result = workCompletionRequestSchema.safeParse({
      ...validFailed,
      reason: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects reason exceeding 2000 characters', () => {
    const result = workCompletionRequestSchema.safeParse({
      ...validFailed,
      reason: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = workCompletionRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
