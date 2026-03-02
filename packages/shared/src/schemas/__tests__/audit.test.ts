// Unit tests for the audit event schema and supporting enums.
// Validates action types, actor types, change diffs, and full events.

import { describe, it, expect } from 'vitest';

import {
  auditActionSchema,
  auditActorTypeSchema,
  auditChangeDiffSchema,
  auditEventSchema,
} from '../audit';

describe('auditActionSchema', () => {
  const validActions = [
    'created',
    'updated',
    'deleted',
    'status_changed',
    'assigned',
    'completed',
  ] as const;

  it.each(validActions)('accepts action "%s"', (action) => {
    expect(auditActionSchema.safeParse(action).success).toBe(true);
  });

  it('rejects invalid action', () => {
    expect(auditActionSchema.safeParse('removed').success).toBe(false);
  });
});

describe('auditActorTypeSchema', () => {
  const validActors = ['user', 'worker', 'system'] as const;

  it.each(validActors)('accepts actor type "%s"', (actorType) => {
    expect(auditActorTypeSchema.safeParse(actorType).success).toBe(true);
  });

  it('rejects invalid actor type', () => {
    expect(auditActorTypeSchema.safeParse('admin').success).toBe(false);
  });
});

describe('auditChangeDiffSchema', () => {
  it('accepts a diff with both before and after', () => {
    const result = auditChangeDiffSchema.safeParse({ before: 'old', after: 'new' });
    expect(result.success).toBe(true);
  });

  it('accepts a diff with only after (new field)', () => {
    const result = auditChangeDiffSchema.safeParse({ after: 'new' });
    expect(result.success).toBe(true);
  });

  it('accepts a diff with only before (removed field)', () => {
    const result = auditChangeDiffSchema.safeParse({ before: 'old' });
    expect(result.success).toBe(true);
  });

  it('accepts an empty diff object', () => {
    const result = auditChangeDiffSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts null values in before and after', () => {
    const result = auditChangeDiffSchema.safeParse({ before: null, after: null });
    expect(result.success).toBe(true);
  });

  it('accepts numeric and boolean values', () => {
    const result = auditChangeDiffSchema.safeParse({ before: 0, after: true });
    expect(result.success).toBe(true);
  });
});

describe('auditEventSchema', () => {
  const validEvent = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    entityType: 'project',
    entityId: '550e8400-e29b-41d4-a716-446655440001',
    action: 'updated',
    actorType: 'user',
    actorId: 'user-123',
    timestamp: '2026-03-02T12:00:00.000Z',
  } as const;

  it('accepts a valid audit event without optional fields', () => {
    const result = auditEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('accepts audit event with changes', () => {
    const result = auditEventSchema.safeParse({
      ...validEvent,
      changes: {
        name: { before: 'Old Name', after: 'New Name' },
        status: { before: 'active', after: 'completed' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts audit event with metadata', () => {
    const result = auditEventSchema.safeParse({
      ...validEvent,
      metadata: { source: 'api', ip: '192.168.1.1' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts audit event with both changes and metadata', () => {
    const result = auditEventSchema.safeParse({
      ...validEvent,
      changes: { status: { before: 'draft', after: 'active' } },
      metadata: { source: 'worker', correlationId: 'abc-123' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID eventId', () => {
    expect(auditEventSchema.safeParse({ ...validEvent, eventId: 'bad' }).success).toBe(false);
  });

  it('rejects empty entityType', () => {
    expect(auditEventSchema.safeParse({ ...validEvent, entityType: '' }).success).toBe(false);
  });

  it('rejects entityType exceeding 100 characters', () => {
    expect(auditEventSchema.safeParse({ ...validEvent, entityType: 'x'.repeat(101) }).success).toBe(
      false,
    );
  });

  it('rejects empty entityId', () => {
    expect(auditEventSchema.safeParse({ ...validEvent, entityId: '' }).success).toBe(false);
  });

  it('rejects invalid action', () => {
    expect(auditEventSchema.safeParse({ ...validEvent, action: 'removed' }).success).toBe(false);
  });

  it('rejects invalid actorType', () => {
    expect(auditEventSchema.safeParse({ ...validEvent, actorType: 'admin' }).success).toBe(false);
  });

  it('rejects empty actorId', () => {
    expect(auditEventSchema.safeParse({ ...validEvent, actorId: '' }).success).toBe(false);
  });

  it('rejects invalid timestamp', () => {
    expect(auditEventSchema.safeParse({ ...validEvent, timestamp: 'not-a-date' }).success).toBe(
      false,
    );
  });

  it('rejects missing required fields', () => {
    expect(auditEventSchema.safeParse({}).success).toBe(false);
  });
});
