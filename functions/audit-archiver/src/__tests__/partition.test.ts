/**
 * Unit tests for the date partitioning utility (groupByDate).
 *
 * Tests cover:
 * - Grouping events by their UTC date
 * - Empty array returns empty Map
 * - All same-day events grouped together
 * - Zero-padding of months and days
 * - UTC boundary handling (23:30 UTC stays on that UTC date)
 */

import { describe, it, expect } from 'vitest';

import { groupByDate } from '../partition';

import type { AuditEvent } from '../dynamo';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Factory for creating mock AuditEvent objects with sensible defaults. */
const createMockEvent = (overrides: Partial<AuditEvent> = {}): AuditEvent => ({
  pk: 'EVENT#test-123',
  sk: 'TS#2025-09-15T10:00:00.000Z',
  eventType: 'task.completed',
  projectId: 'project-1',
  entityId: 'entity-1',
  entityType: 'task',
  userId: 'user-1',
  agentId: null,
  metadata: {},
  timestamp: '2025-09-15T10:00:00.000Z',
  ttl: 1726394400,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('groupByDate', () => {
  it('should group events by their UTC date', () => {
    const events: AuditEvent[] = [
      createMockEvent({
        pk: 'EVENT#1',
        timestamp: '2025-09-15T10:00:00.000Z',
      }),
      createMockEvent({
        pk: 'EVENT#2',
        timestamp: '2025-09-16T08:00:00.000Z',
      }),
      createMockEvent({
        pk: 'EVENT#3',
        timestamp: '2025-09-15T14:30:00.000Z',
      }),
    ];

    const result = groupByDate(events);

    expect(result.size).toBe(2);
    expect(result.get('2025/09/15')).toHaveLength(2);
    expect(result.get('2025/09/16')).toHaveLength(1);
  });

  it('should return an empty Map for an empty array', () => {
    const result = groupByDate([]);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('should group all same-day events together', () => {
    const events: AuditEvent[] = [
      createMockEvent({
        pk: 'EVENT#a',
        timestamp: '2025-09-15T00:00:00.000Z',
      }),
      createMockEvent({
        pk: 'EVENT#b',
        timestamp: '2025-09-15T06:30:00.000Z',
      }),
      createMockEvent({
        pk: 'EVENT#c',
        timestamp: '2025-09-15T12:00:00.000Z',
      }),
      createMockEvent({
        pk: 'EVENT#d',
        timestamp: '2025-09-15T18:45:00.000Z',
      }),
      createMockEvent({
        pk: 'EVENT#e',
        timestamp: '2025-09-15T23:59:59.999Z',
      }),
    ];

    const result = groupByDate(events);

    expect(result.size).toBe(1);
    const grouped = result.get('2025/09/15');
    expect(grouped).toHaveLength(5);

    // Verify all events are present
    const pks = grouped?.map((e) => e.pk) ?? [];
    expect(pks).toEqual(['EVENT#a', 'EVENT#b', 'EVENT#c', 'EVENT#d', 'EVENT#e']);
  });

  it('should zero-pad months and days', () => {
    const events: AuditEvent[] = [
      createMockEvent({
        pk: 'EVENT#jan',
        timestamp: '2026-01-05T10:00:00.000Z',
      }),
      createMockEvent({
        pk: 'EVENT#feb',
        timestamp: '2026-02-09T10:00:00.000Z',
      }),
      createMockEvent({
        pk: 'EVENT#mar',
        timestamp: '2026-03-01T10:00:00.000Z',
      }),
    ];

    const result = groupByDate(events);

    expect(result.has('2026/01/05')).toBe(true);
    expect(result.has('2026/02/09')).toBe(true);
    expect(result.has('2026/03/01')).toBe(true);

    // Verify there are no single-digit month/day keys
    expect(result.has('2026/1/5')).toBe(false);
    expect(result.has('2026/2/9')).toBe(false);
    expect(result.has('2026/3/1')).toBe(false);
  });

  it('should use UTC date for partitioning at UTC boundaries', () => {
    // 23:30 UTC on Jan 15 - in UTC+2 this would be Jan 16, 01:30
    const events: AuditEvent[] = [
      createMockEvent({
        pk: 'EVENT#late-utc',
        timestamp: '2026-01-15T23:30:00.000Z',
      }),
    ];

    const result = groupByDate(events);

    expect(result.has('2026/01/15')).toBe(true);
    expect(result.has('2026/01/16')).toBe(false);
    expect(result.get('2026/01/15')).toHaveLength(1);
  });

  it('should handle events at midnight boundary correctly', () => {
    const events: AuditEvent[] = [
      createMockEvent({
        pk: 'EVENT#midnight-end',
        timestamp: '2025-12-31T23:59:59.999Z',
      }),
      createMockEvent({
        pk: 'EVENT#midnight-start',
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ];

    const result = groupByDate(events);

    expect(result.size).toBe(2);
    expect(result.get('2025/12/31')).toHaveLength(1);
    expect(result.get('2026/01/01')).toHaveLength(1);
  });

  it('should handle events spanning multiple months', () => {
    const events: AuditEvent[] = [
      createMockEvent({
        pk: 'EVENT#oct',
        timestamp: '2025-10-15T10:00:00.000Z',
      }),
      createMockEvent({
        pk: 'EVENT#nov',
        timestamp: '2025-11-20T10:00:00.000Z',
      }),
      createMockEvent({
        pk: 'EVENT#dec',
        timestamp: '2025-12-25T10:00:00.000Z',
      }),
    ];

    const result = groupByDate(events);

    expect(result.size).toBe(3);
    expect(result.has('2025/10/15')).toBe(true);
    expect(result.has('2025/11/20')).toBe(true);
    expect(result.has('2025/12/25')).toBe(true);
  });

  it('should preserve event order within each date group', () => {
    const events: AuditEvent[] = [
      createMockEvent({
        pk: 'EVENT#first',
        timestamp: '2025-09-15T08:00:00.000Z',
      }),
      createMockEvent({
        pk: 'EVENT#second',
        timestamp: '2025-09-15T12:00:00.000Z',
      }),
      createMockEvent({
        pk: 'EVENT#third',
        timestamp: '2025-09-15T16:00:00.000Z',
      }),
    ];

    const result = groupByDate(events);
    const group = result.get('2025/09/15');

    expect(group?.[0]?.pk).toBe('EVENT#first');
    expect(group?.[1]?.pk).toBe('EVENT#second');
    expect(group?.[2]?.pk).toBe('EVENT#third');
  });

  it('should handle double-digit months and days without extra padding', () => {
    const events: AuditEvent[] = [
      createMockEvent({
        pk: 'EVENT#double-digit',
        timestamp: '2025-12-31T10:00:00.000Z',
      }),
    ];

    const result = groupByDate(events);

    // December 31 should be 12/31, not 012/031
    expect(result.has('2025/12/31')).toBe(true);
  });
});
