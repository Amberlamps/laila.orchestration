// Unit tests for the UserStory entity Zod schema.
// Validates correct acceptance and rejection of input shapes.

import { describe, it, expect } from 'vitest';

import { PRIORITIES, WORK_STATUSES } from '../../constants';
import { userStorySchema } from '../user-story';

const validUserStory = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '550e8400-e29b-41d4-a716-446655440001',
  epicId: '550e8400-e29b-41d4-a716-446655440002',
  title: 'Test User Story',
  description: 'A user story description',
  priority: 'medium',
  workStatus: 'pending',
  costEstimate: null,
  actualCost: null,
  assignedWorkerId: null,
  assignedAt: null,
  attempts: 0,
  maxAttempts: 3,
  version: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
} as const;

describe('userStorySchema', () => {
  it('accepts a valid user story', () => {
    const result = userStorySchema.safeParse(validUserStory);
    expect(result.success).toBe(true);
  });

  it.each(PRIORITIES)('accepts priority "%s"', (priority) => {
    const result = userStorySchema.safeParse({ ...validUserStory, priority });
    expect(result.success).toBe(true);
  });

  it.each(WORK_STATUSES)('accepts workStatus "%s"', (status) => {
    const result = userStorySchema.safeParse({ ...validUserStory, workStatus: status });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid priority', () => {
    const result = userStorySchema.safeParse({ ...validUserStory, priority: 'urgent' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid work status', () => {
    const result = userStorySchema.safeParse({ ...validUserStory, workStatus: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('accepts numeric costEstimate', () => {
    const result = userStorySchema.safeParse({ ...validUserStory, costEstimate: 42.5 });
    expect(result.success).toBe(true);
  });

  it('accepts null costEstimate', () => {
    const result = userStorySchema.safeParse({ ...validUserStory, costEstimate: null });
    expect(result.success).toBe(true);
  });

  it('rejects negative costEstimate', () => {
    const result = userStorySchema.safeParse({ ...validUserStory, costEstimate: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts numeric actualCost', () => {
    const result = userStorySchema.safeParse({ ...validUserStory, actualCost: 100.0 });
    expect(result.success).toBe(true);
  });

  it('rejects negative actualCost', () => {
    const result = userStorySchema.safeParse({ ...validUserStory, actualCost: -5 });
    expect(result.success).toBe(false);
  });

  it('accepts a UUID for assignedWorkerId', () => {
    const result = userStorySchema.safeParse({
      ...validUserStory,
      assignedWorkerId: '550e8400-e29b-41d4-a716-446655440099',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID assignedWorkerId', () => {
    const result = userStorySchema.safeParse({
      ...validUserStory,
      assignedWorkerId: 'not-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a datetime for assignedAt', () => {
    const result = userStorySchema.safeParse({
      ...validUserStory,
      assignedAt: '2026-03-01T10:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects zero maxAttempts', () => {
    const result = userStorySchema.safeParse({ ...validUserStory, maxAttempts: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative attempts', () => {
    const result = userStorySchema.safeParse({ ...validUserStory, attempts: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer attempts', () => {
    const result = userStorySchema.safeParse({ ...validUserStory, attempts: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects an empty title', () => {
    const result = userStorySchema.safeParse({ ...validUserStory, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID epicId', () => {
    const result = userStorySchema.safeParse({ ...validUserStory, epicId: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = userStorySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
