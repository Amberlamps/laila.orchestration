/**
 * Unit tests for the audit archiver Lambda handler.
 *
 * Mocks the DynamoDB scanning (scanExpiredEvents), S3 upload (uploadArchive),
 * and logger modules. Tests cover:
 * - S3 key partitioning by date
 * - NDJSON format (events passed to uploadArchive)
 * - Pagination via async generator
 * - Empty result handling
 * - Large batch processing
 * - S3 upload configuration (bucket name forwarding)
 * - Summary reporting (ArchiveResult accuracy)
 * - Environment variable validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { AuditEvent } from '../dynamo';
import type { ScheduledEvent, Context } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mock scanExpiredEvents and uploadArchive
// ---------------------------------------------------------------------------

const mockScanExpiredEvents = vi.fn();
const mockUploadArchive = vi.fn();

vi.mock('../dynamo', () => ({
  scanExpiredEvents: (...args: unknown[]) => mockScanExpiredEvents(...args) as unknown,
}));

vi.mock('../s3', () => ({
  uploadArchive: (...args: unknown[]) => mockUploadArchive(...args) as unknown,
}));

vi.mock('../logger', () => ({
  createInvocationLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal ScheduledEvent for testing. */
const createScheduledEvent = (): ScheduledEvent => ({
  version: '0',
  id: 'test-event-id',
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  account: '123456789012',
  time: '2026-03-04T02:00:00Z',
  region: 'us-east-1',
  resources: ['arn:aws:events:us-east-1:123456789012:rule/audit-archiver'],
  detail: {},
});

/** Create a minimal Lambda Context for testing. */
const createContext = (): Context =>
  ({
    awsRequestId: 'test-request-id',
    functionName: 'audit-archiver',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:audit-archiver',
    memoryLimitInMB: '256',
    logGroupName: '/aws/lambda/audit-archiver',
    logStreamName: '2026/03/04/[$LATEST]abc123',
    callbackWaitsForEmptyEventLoop: true,
    getRemainingTimeInMillis: () => 300000,
    done: vi.fn(),
    fail: vi.fn(),
    succeed: vi.fn(),
  }) as unknown as Context;

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

/**
 * Creates an async generator function for use with mockScanExpiredEvents.
 * This version is compatible with `for await...of` consumption.
 */
function mockAsyncGenerator(batches: AuditEvent[][]): AsyncGenerator<AuditEvent[], void, unknown> {
  async function* gen(): AsyncGenerator<AuditEvent[], void, unknown> {
    for (const batch of batches) {
      yield batch;
    }
  }
  return gen();
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('audit-archiver handler', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();

    // Save the original env and set required variables
    savedEnv = { ...process.env };
    process.env['TABLE_NAME'] = 'audit-events-table';
    process.env['BUCKET_NAME'] = 'audit-archive-bucket';

    // Default: uploadArchive returns a sensible result
    mockUploadArchive.mockImplementation(
      (params: {
        bucketName: string;
        events: AuditEvent[];
        partitionDate: { year: string; month: string; day: string };
        batchTimestamp: number;
        sequenceNumber: number;
      }) => {
        const ndjson = params.events.map((e: AuditEvent) => JSON.stringify(e)).join('\n');
        const sizeBytes = Buffer.byteLength(ndjson, 'utf-8');
        const key = `audit/${params.partitionDate.year}/${params.partitionDate.month}/${params.partitionDate.day}/events-${String(params.batchTimestamp)}-${String(params.sequenceNumber)}.ndjson`;
        return Promise.resolve({ key, sizeBytes });
      },
    );
  });

  afterEach(() => {
    // Restore original environment
    process.env = savedEnv;
  });

  // =========================================================================
  // Environment Variable Validation
  // =========================================================================

  describe('environment variable validation', () => {
    it('should throw when TABLE_NAME is not set', async () => {
      const { handler } = await import('../handler');
      delete process.env['TABLE_NAME'];

      await expect(handler(createScheduledEvent(), createContext())).rejects.toThrow(
        'TABLE_NAME is not set',
      );
    });

    it('should throw when BUCKET_NAME is not set', async () => {
      const { handler } = await import('../handler');
      delete process.env['BUCKET_NAME'];

      await expect(handler(createScheduledEvent(), createContext())).rejects.toThrow(
        'BUCKET_NAME is not set',
      );
    });
  });

  // =========================================================================
  // S3 Key Partitioning
  // =========================================================================

  describe('S3 key partitioning', () => {
    it('should partition events by year/month/day in S3 keys', async () => {
      const { handler } = await import('../handler');

      const eventsDay1 = [
        createMockEvent({
          pk: 'EVENT#1',
          timestamp: '2025-12-15T10:00:00.000Z',
        }),
        createMockEvent({
          pk: 'EVENT#2',
          timestamp: '2025-12-15T14:00:00.000Z',
        }),
      ];
      const eventsDay2 = [
        createMockEvent({
          pk: 'EVENT#3',
          timestamp: '2025-12-16T08:00:00.000Z',
        }),
      ];

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([[...eventsDay1, ...eventsDay2]]));

      const result = await handler(createScheduledEvent(), createContext());

      expect(result.filesWritten).toBe(2);
      expect(result.partitions).toContain('2025/12/15');
      expect(result.partitions).toContain('2025/12/16');
      expect(result.partitions).toHaveLength(2);

      // Verify uploadArchive was called twice with correct partition dates
      expect(mockUploadArchive).toHaveBeenCalledTimes(2);

      const calls = mockUploadArchive.mock.calls as Array<
        [
          {
            bucketName: string;
            events: AuditEvent[];
            partitionDate: { year: string; month: string; day: string };
            batchTimestamp: number;
            sequenceNumber: number;
          },
        ]
      >;

      const partitionDates = calls.map((c) => c[0].partitionDate);
      expect(partitionDates).toContainEqual({
        year: '2025',
        month: '12',
        day: '15',
      });
      expect(partitionDates).toContainEqual({
        year: '2025',
        month: '12',
        day: '16',
      });
    });

    it('should zero-pad month and day in S3 keys', async () => {
      const { handler } = await import('../handler');

      const events = [
        createMockEvent({
          pk: 'EVENT#zp',
          timestamp: '2026-01-05T10:00:00.000Z',
        }),
      ];

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([events]));

      const result = await handler(createScheduledEvent(), createContext());

      expect(result.partitions).toContain('2026/01/05');

      const call = mockUploadArchive.mock.calls[0] as [
        {
          partitionDate: { year: string; month: string; day: string };
        },
      ];
      expect(call[0].partitionDate).toEqual({
        year: '2026',
        month: '01',
        day: '05',
      });
    });

    it('should use UTC date for partitioning to avoid timezone issues', async () => {
      const { handler } = await import('../handler');

      // 23:30 UTC on Jan 15 - in UTC+2 this would be Jan 16
      const events = [
        createMockEvent({
          pk: 'EVENT#utc',
          timestamp: '2026-01-15T23:30:00.000Z',
        }),
      ];

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([events]));

      const result = await handler(createScheduledEvent(), createContext());

      // Should be partitioned under Jan 15 (UTC), not Jan 16
      expect(result.partitions).toContain('2026/01/15');
      expect(result.partitions).not.toContain('2026/01/16');
    });

    it('should generate unique S3 keys when multiple batches target the same date', async () => {
      const { handler } = await import('../handler');

      // Two batches, both containing events on 2025-09-15
      const batch1 = [
        createMockEvent({
          pk: 'EVENT#b1',
          timestamp: '2025-09-15T08:00:00.000Z',
        }),
      ];
      const batch2 = [
        createMockEvent({
          pk: 'EVENT#b2',
          timestamp: '2025-09-15T16:00:00.000Z',
        }),
      ];

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([batch1, batch2]));

      await handler(createScheduledEvent(), createContext());

      // Both batches target the same date partition → 2 separate uploads
      expect(mockUploadArchive).toHaveBeenCalledTimes(2);

      // Verify each upload got a different sequenceNumber
      const calls = mockUploadArchive.mock.calls as Array<
        [
          {
            bucketName: string;
            events: AuditEvent[];
            partitionDate: { year: string; month: string; day: string };
            batchTimestamp: number;
            sequenceNumber: number;
          },
        ]
      >;

      const call1 = calls[0]![0];
      const call2 = calls[1]![0];
      expect(call1.sequenceNumber).not.toBe(call2.sequenceNumber);

      // Verify the mock-generated keys are unique
      const key1 = `audit/${call1.partitionDate.year}/${call1.partitionDate.month}/${call1.partitionDate.day}/events-${String(call1.batchTimestamp)}-${String(call1.sequenceNumber)}.ndjson`;
      const key2 = `audit/${call2.partitionDate.year}/${call2.partitionDate.month}/${call2.partitionDate.day}/events-${String(call2.batchTimestamp)}-${String(call2.sequenceNumber)}.ndjson`;
      expect(key1).not.toBe(key2);
    });

    it('should handle events spanning multiple months', async () => {
      const { handler } = await import('../handler');

      const events = [
        createMockEvent({
          pk: 'EVENT#nov',
          timestamp: '2025-11-30T22:00:00.000Z',
        }),
        createMockEvent({
          pk: 'EVENT#dec',
          timestamp: '2025-12-01T02:00:00.000Z',
        }),
      ];

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([events]));

      const result = await handler(createScheduledEvent(), createContext());

      expect(result.partitions).toContain('2025/11/30');
      expect(result.partitions).toContain('2025/12/01');
      expect(result.filesWritten).toBe(2);
    });
  });

  // =========================================================================
  // NDJSON Format
  // =========================================================================

  describe('NDJSON format', () => {
    it('should pass correct events to uploadArchive for serialization', async () => {
      const { handler } = await import('../handler');

      const events = [
        createMockEvent({
          pk: 'EVENT#1',
          timestamp: '2025-09-15T10:00:00.000Z',
          eventType: 'task.created',
        }),
        createMockEvent({
          pk: 'EVENT#2',
          timestamp: '2025-09-15T11:00:00.000Z',
          eventType: 'task.updated',
        }),
        createMockEvent({
          pk: 'EVENT#3',
          timestamp: '2025-09-15T12:00:00.000Z',
          eventType: 'task.completed',
        }),
      ];

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([events]));

      await handler(createScheduledEvent(), createContext());

      // All 3 events are on the same date, so one call with all 3 events
      expect(mockUploadArchive).toHaveBeenCalledTimes(1);

      const call = mockUploadArchive.mock.calls[0] as [{ events: AuditEvent[] }];
      expect(call[0].events).toHaveLength(3);
      expect(call[0].events[0]?.pk).toBe('EVENT#1');
      expect(call[0].events[1]?.pk).toBe('EVENT#2');
      expect(call[0].events[2]?.pk).toBe('EVENT#3');
    });

    it('should handle events with special characters in metadata', async () => {
      const { handler } = await import('../handler');

      const events = [
        createMockEvent({
          pk: 'EVENT#special',
          timestamp: '2025-09-15T10:00:00.000Z',
          metadata: {
            description: 'Line 1\nLine 2\tTabbed',
            quotes: 'He said "hello"',
            unicode: '\u00e9\u00e8\u00ea',
          },
        }),
      ];

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([events]));

      await handler(createScheduledEvent(), createContext());

      expect(mockUploadArchive).toHaveBeenCalledTimes(1);

      const call = mockUploadArchive.mock.calls[0] as [{ events: AuditEvent[] }];
      expect(call[0].events[0]?.metadata).toEqual({
        description: 'Line 1\nLine 2\tTabbed',
        quotes: 'He said "hello"',
        unicode: '\u00e9\u00e8\u00ea',
      });
    });

    it('should preserve all event fields when passed to uploadArchive', async () => {
      const { handler } = await import('../handler');

      const fullEvent = createMockEvent({
        pk: 'EVENT#full-fields',
        sk: 'TS#2025-09-15T10:30:00.000Z',
        eventType: 'story.started',
        projectId: 'project-42',
        entityId: 'entity-99',
        entityType: 'story',
        userId: 'user-abc',
        agentId: 'agent-def',
        metadata: { key: 'value', nested: { a: 1 } },
        timestamp: '2025-09-15T10:30:00.000Z',
        ttl: 1726394400,
      });

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([[fullEvent]]));

      await handler(createScheduledEvent(), createContext());

      const call = mockUploadArchive.mock.calls[0] as [{ events: AuditEvent[] }];
      expect(call[0].events[0]).toEqual(fullEvent);
    });
  });

  // =========================================================================
  // Pagination
  // =========================================================================

  describe('pagination', () => {
    it('should handle paginated DynamoDB scan results across multiple batches', async () => {
      const { handler } = await import('../handler');

      const batch1 = Array.from({ length: 3 }, (_, i) =>
        createMockEvent({
          pk: `EVENT#batch1-${String(i)}`,
          timestamp: '2025-09-15T10:00:00.000Z',
        }),
      );
      const batch2 = Array.from({ length: 3 }, (_, i) =>
        createMockEvent({
          pk: `EVENT#batch2-${String(i)}`,
          timestamp: '2025-09-15T11:00:00.000Z',
        }),
      );
      const batch3 = Array.from({ length: 2 }, (_, i) =>
        createMockEvent({
          pk: `EVENT#batch3-${String(i)}`,
          timestamp: '2025-09-15T12:00:00.000Z',
        }),
      );

      // Three separate yields from the async generator
      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([batch1, batch2, batch3]));

      const result = await handler(createScheduledEvent(), createContext());

      // All events are on the same date, so each batch yields one uploadArchive call
      // but the same partition key is reused
      expect(result.eventsArchived).toBe(8);
      expect(result.partitions).toContain('2025/09/15');
    });

    it('should correctly accumulate events across pages', async () => {
      const { handler } = await import('../handler');

      const batch1 = Array.from({ length: 1000 }, (_, i) =>
        createMockEvent({
          pk: `EVENT#p1-${String(i)}`,
          timestamp: '2025-09-15T10:00:00.000Z',
        }),
      );
      const batch2 = Array.from({ length: 1000 }, (_, i) =>
        createMockEvent({
          pk: `EVENT#p2-${String(i)}`,
          timestamp: '2025-09-15T10:00:00.000Z',
        }),
      );
      const batch3 = Array.from({ length: 500 }, (_, i) =>
        createMockEvent({
          pk: `EVENT#p3-${String(i)}`,
          timestamp: '2025-09-15T10:00:00.000Z',
        }),
      );

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([batch1, batch2, batch3]));

      const result = await handler(createScheduledEvent(), createContext());

      expect(result.eventsArchived).toBe(2500);
    });
  });

  // =========================================================================
  // Empty Results
  // =========================================================================

  describe('empty results', () => {
    it('should handle no events to archive gracefully', async () => {
      const { handler } = await import('../handler');

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([]));

      const result = await handler(createScheduledEvent(), createContext());

      expect(result).toEqual({
        eventsArchived: 0,
        filesWritten: 0,
        totalSizeBytes: 0,
        partitions: [],
      });
    });

    it('should not create S3 objects when there are no events', async () => {
      const { handler } = await import('../handler');

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([]));

      await handler(createScheduledEvent(), createContext());

      expect(mockUploadArchive).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Large Batch Handling
  // =========================================================================

  describe('large batch handling', () => {
    it('should process large numbers of events without issues', async () => {
      const { handler } = await import('../handler');

      // 10 batches of 1000 events each = 10,000 events
      const batches = Array.from({ length: 10 }, (_, batchIdx) =>
        Array.from({ length: 1000 }, (_, eventIdx) =>
          createMockEvent({
            pk: `EVENT#b${String(batchIdx)}-e${String(eventIdx)}`,
            timestamp: '2025-09-15T10:00:00.000Z',
          }),
        ),
      );

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator(batches));

      const result = await handler(createScheduledEvent(), createContext());

      expect(result.eventsArchived).toBe(10000);
    });

    it('should use streaming/generator pattern for DynamoDB scanning', async () => {
      const { handler } = await import('../handler');

      const yieldOrder: number[] = [];

      async function* trackingGenerator(): AsyncGenerator<AuditEvent[], void, unknown> {
        yieldOrder.push(1);
        yield [
          createMockEvent({
            pk: 'EVENT#g1',
            timestamp: '2025-09-15T10:00:00.000Z',
          }),
        ];
        yieldOrder.push(2);
        yield [
          createMockEvent({
            pk: 'EVENT#g2',
            timestamp: '2025-09-15T11:00:00.000Z',
          }),
        ];
        yieldOrder.push(3);
        yield [
          createMockEvent({
            pk: 'EVENT#g3',
            timestamp: '2025-09-15T12:00:00.000Z',
          }),
        ];
      }

      mockScanExpiredEvents.mockReturnValue(trackingGenerator());

      await handler(createScheduledEvent(), createContext());

      // All 3 yields should have been consumed
      expect(yieldOrder).toEqual([1, 2, 3]);
      expect(mockUploadArchive).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // S3 Upload Configuration
  // =========================================================================

  describe('S3 upload configuration', () => {
    it('should pass the correct bucketName from env to uploadArchive', async () => {
      const { handler } = await import('../handler');

      process.env['BUCKET_NAME'] = 'my-custom-archive-bucket';

      const events = [
        createMockEvent({
          pk: 'EVENT#bucket',
          timestamp: '2025-09-15T10:00:00.000Z',
        }),
      ];

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([events]));

      await handler(createScheduledEvent(), createContext());

      const call = mockUploadArchive.mock.calls[0] as [{ bucketName: string }];
      expect(call[0].bucketName).toBe('my-custom-archive-bucket');
    });

    it('should pass the correct tableName from env to scanExpiredEvents', async () => {
      const { handler } = await import('../handler');

      process.env['TABLE_NAME'] = 'my-audit-table';

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([]));

      await handler(createScheduledEvent(), createContext());

      const call = mockScanExpiredEvents.mock.calls[0] as [string, string];
      expect(call[1]).toBe('my-audit-table');
    });
  });

  // =========================================================================
  // Summary Reporting
  // =========================================================================

  describe('summary reporting', () => {
    it('should return accurate counts in ArchiveResult', async () => {
      const { handler } = await import('../handler');

      // 150 events across 3 dates: 50 on each date
      const events = [
        ...Array.from({ length: 50 }, (_, i) =>
          createMockEvent({
            pk: `EVENT#d1-${String(i)}`,
            timestamp: '2025-09-15T10:00:00.000Z',
          }),
        ),
        ...Array.from({ length: 50 }, (_, i) =>
          createMockEvent({
            pk: `EVENT#d2-${String(i)}`,
            timestamp: '2025-09-16T10:00:00.000Z',
          }),
        ),
        ...Array.from({ length: 50 }, (_, i) =>
          createMockEvent({
            pk: `EVENT#d3-${String(i)}`,
            timestamp: '2025-09-17T10:00:00.000Z',
          }),
        ),
      ];

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([events]));

      const result = await handler(createScheduledEvent(), createContext());

      expect(result.eventsArchived).toBe(150);
      expect(result.filesWritten).toBe(3);
    });

    it('should include all partition keys in the result', async () => {
      const { handler } = await import('../handler');

      const events = [
        createMockEvent({
          pk: 'EVENT#p1',
          timestamp: '2025-09-15T10:00:00.000Z',
        }),
        createMockEvent({
          pk: 'EVENT#p2',
          timestamp: '2025-10-20T10:00:00.000Z',
        }),
        createMockEvent({
          pk: 'EVENT#p3',
          timestamp: '2025-11-25T10:00:00.000Z',
        }),
      ];

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([events]));

      const result = await handler(createScheduledEvent(), createContext());

      expect(result.partitions).toEqual(
        expect.arrayContaining(['2025/09/15', '2025/10/20', '2025/11/25']),
      );
      expect(result.partitions).toHaveLength(3);
    });

    it('should report total size in bytes', async () => {
      const { handler } = await import('../handler');

      const event1 = createMockEvent({
        pk: 'EVENT#sz1',
        timestamp: '2025-09-15T10:00:00.000Z',
      });
      const event2 = createMockEvent({
        pk: 'EVENT#sz2',
        timestamp: '2025-09-16T10:00:00.000Z',
      });

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([[event1, event2]]));

      // Calculate expected sizes
      const size1 = Buffer.byteLength(JSON.stringify(event1), 'utf-8');
      const size2 = Buffer.byteLength(JSON.stringify(event2), 'utf-8');

      const result = await handler(createScheduledEvent(), createContext());

      // Each event is on a different date, so 2 separate uploads
      expect(result.totalSizeBytes).toBe(size1 + size2);
      expect(result.totalSizeBytes).toBeGreaterThan(0);
    });

    it('should not duplicate partition keys when multiple batches have same date', async () => {
      const { handler } = await import('../handler');

      // Two batches, both with events on the same date
      const batch1 = [
        createMockEvent({
          pk: 'EVENT#dup1',
          timestamp: '2025-09-15T10:00:00.000Z',
        }),
      ];
      const batch2 = [
        createMockEvent({
          pk: 'EVENT#dup2',
          timestamp: '2025-09-15T14:00:00.000Z',
        }),
      ];

      mockScanExpiredEvents.mockReturnValue(mockAsyncGenerator([batch1, batch2]));

      const result = await handler(createScheduledEvent(), createContext());

      // The partition key should appear only once even though two batches had events on that date
      const count = result.partitions.filter((p: string) => p === '2025/09/15').length;
      expect(count).toBe(1);
    });
  });
});
