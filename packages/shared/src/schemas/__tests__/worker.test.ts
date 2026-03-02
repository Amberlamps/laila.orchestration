// Unit tests for the Worker entity Zod schema.
// Validates correct acceptance and rejection of input shapes.

import { describe, it, expect } from 'vitest';

import { workerSchema } from '../worker';

const validWorker = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'agent-backend-01',
  description: 'Backend worker agent',
  isActive: true,
  lastSeenAt: '2026-03-01T10:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

describe('workerSchema', () => {
  it('accepts a valid worker', () => {
    const result = workerSchema.safeParse(validWorker);
    expect(result.success).toBe(true);
  });

  it('accepts null description', () => {
    const result = workerSchema.safeParse({ ...validWorker, description: null });
    expect(result.success).toBe(true);
  });

  it('accepts null lastSeenAt', () => {
    const result = workerSchema.safeParse({ ...validWorker, lastSeenAt: null });
    expect(result.success).toBe(true);
  });

  it('accepts isActive as false', () => {
    const result = workerSchema.safeParse({ ...validWorker, isActive: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(false);
    }
  });

  it('rejects a non-UUID id', () => {
    const result = workerSchema.safeParse({ ...validWorker, id: 'not-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID tenantId', () => {
    const result = workerSchema.safeParse({ ...validWorker, tenantId: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = workerSchema.safeParse({ ...validWorker, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding 255 characters', () => {
    const result = workerSchema.safeParse({ ...validWorker, name: 'x'.repeat(256) });
    expect(result.success).toBe(false);
  });

  it('rejects description exceeding 2000 characters', () => {
    const result = workerSchema.safeParse({
      ...validWorker,
      description: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-boolean isActive', () => {
    const result = workerSchema.safeParse({ ...validWorker, isActive: 'yes' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid datetime for lastSeenAt', () => {
    const result = workerSchema.safeParse({ ...validWorker, lastSeenAt: 'bad-date' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid datetime for createdAt', () => {
    const result = workerSchema.safeParse({ ...validWorker, createdAt: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = workerSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
