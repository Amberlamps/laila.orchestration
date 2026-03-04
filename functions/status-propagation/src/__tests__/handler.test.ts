/**
 * Unit tests for the SQS status propagation consumer handler.
 *
 * Tests the Lambda entry point (`handler.ts`) which processes SQS batches
 * containing status change events. All internal modules (evaluator, propagator,
 * idempotency, db, audit, logger) are mocked so tests focus on:
 *
 * - Batch processing (multiple messages, mixed success/failure)
 * - Partial batch failure response (correct batchItemFailures)
 * - Idempotency (skip already-processed events, record new ones)
 * - Story-level propagation (task -> story status aggregation)
 * - Epic-level propagation (story -> epic status aggregation)
 * - Audit event writing
 * - Error handling (malformed JSON, database errors)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { StatusChangeEvent, DependentEvaluation, PropagationResult } from '../types';
import type { SQSEvent, SQSRecord, SQSBatchResponse, Context } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mock: db module
// ---------------------------------------------------------------------------

const mockCreatePoolClient = vi.fn().mockReturnValue({});

vi.mock('../db', () => ({
  createPoolClient: mockCreatePoolClient,
  findDependentTaskIds: vi.fn(),
  findTaskById: vi.fn(),
  areAllPrerequisitesComplete: vi.fn(),
  transitionTaskToPending: vi.fn(),
  withTransaction: vi.fn(),
  findStoryForTask: vi.fn(),
  findStoryById: vi.fn(),
  findTasksByStoryId: vi.fn(),
  findEpicById: vi.fn(),
  findStoriesByEpicId: vi.fn(),
  updateStoryStatus: vi.fn(),
  updateEpicStatus: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: evaluator module
// ---------------------------------------------------------------------------

const mockEvaluateDependents = vi.fn();

vi.mock('../evaluator', () => ({
  evaluateDependents: (...args: unknown[]) => mockEvaluateDependents(...args) as unknown,
}));

// ---------------------------------------------------------------------------
// Mock: propagator module
// ---------------------------------------------------------------------------

const mockPropagateToStory = vi.fn();
const mockPropagateToEpic = vi.fn();

vi.mock('../propagator', () => ({
  propagateToStory: (...args: unknown[]) => mockPropagateToStory(...args) as unknown,
  propagateToEpic: (...args: unknown[]) => mockPropagateToEpic(...args) as unknown,
  deriveStoryStatus: vi.fn(),
  deriveEpicStatus: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: idempotency module
// ---------------------------------------------------------------------------

const mockIsAlreadyProcessed = vi.fn();
const mockRecordProcessed = vi.fn();

vi.mock('../idempotency', () => ({
  isAlreadyProcessed: (...args: unknown[]) => mockIsAlreadyProcessed(...args) as unknown,
  recordProcessed: (...args: unknown[]) => mockRecordProcessed(...args) as unknown,
}));

// ---------------------------------------------------------------------------
// Mock: audit module
// ---------------------------------------------------------------------------

const mockWriteAllAuditEvents = vi.fn();

vi.mock('../audit', () => ({
  writeAllAuditEvents: (...args: unknown[]) => mockWriteAllAuditEvents(...args) as unknown,
  writeTaskUnblockAuditEvent: vi.fn(),
  writePropagationAuditEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: logger module
// ---------------------------------------------------------------------------

const mockChildLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../logger', () => ({
  createInvocationLogger: vi.fn().mockReturnValue(mockChildLogger),
  baseLogger: { child: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock: @laila/database
// ---------------------------------------------------------------------------

vi.mock('@laila/database', () => ({
  createDrizzleClient: vi.fn(),
  writeAuditEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a typed SQS record without using `any`.
 */
function createSQSRecord(overrides: Partial<SQSRecord> & { body: string }): SQSRecord {
  const defaults: SQSRecord = {
    messageId: `msg-${Math.random().toString(36).slice(2)}`,
    receiptHandle: 'receipt-handle',
    body: overrides.body,
    attributes: {
      ApproximateReceiveCount: '1',
      SentTimestamp: Date.now().toString(),
      SenderId: 'sender',
      ApproximateFirstReceiveTimestamp: Date.now().toString(),
    },
    messageAttributes: {},
    md5OfBody: 'md5',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-1:123456789:status-propagation',
    awsRegion: 'us-east-1',
  };

  return {
    ...defaults,
    ...overrides,
  };
}

/**
 * Create a StatusChangeEvent with sensible defaults.
 */
function createStatusChangeEvent(overrides?: Partial<StatusChangeEvent>): StatusChangeEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2)}`,
    eventType: 'task.completed',
    projectId: 'project-1',
    entityId: 'task-1',
    entityType: 'task',
    newStatus: 'done',
    previousStatus: 'in_progress',
    timestamp: new Date().toISOString(),
    tenantId: 'tenant-1',
    ...overrides,
  };
}

/**
 * Create a typed SQS record from a StatusChangeEvent.
 */
function createSQSRecordFromEvent(
  event: StatusChangeEvent,
  overrides?: Partial<SQSRecord>,
): SQSRecord {
  return createSQSRecord({
    body: JSON.stringify(event),
    ...overrides,
  });
}

/**
 * Create a typed SQS batch event.
 */
function createSQSEvent(records: SQSRecord[]): SQSEvent {
  return { Records: records };
}

/**
 * Create a minimal Lambda Context for testing.
 */
const createMockContext = (): Context => ({
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'status-propagation',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:status-propagation',
  memoryLimitInMB: '256',
  awsRequestId: 'req-abc-123',
  logGroupName: '/aws/lambda/status-propagation',
  logStreamName: '2026/03/04/[$LATEST]abc123',
  getRemainingTimeInMillis: () => 30000,
  done: vi.fn(),
  fail: vi.fn(),
  succeed: vi.fn(),
});

/**
 * Create a mock DependentEvaluation result.
 */
function createMockEvaluation(overrides?: Partial<DependentEvaluation>): DependentEvaluation {
  return {
    taskId: 'task-dep-1',
    taskName: 'Dependent Task',
    storyId: 'story-1',
    previousStatus: 'blocked',
    newStatus: 'pending',
    reason: 'All prerequisites complete',
    ...overrides,
  };
}

/**
 * Create a mock PropagationResult.
 */
function createMockPropagation(overrides?: Partial<PropagationResult>): PropagationResult {
  return {
    entityId: 'story-1',
    entityType: 'story',
    entityName: 'Test Story',
    previousStatus: 'in_progress',
    newStatus: 'done',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('status-propagation handler', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();

    savedEnv = { ...process.env };
    process.env['DATABASE_URL'] = 'postgres://test:test@localhost:5432/test';
    process.env['IDEMPOTENCY_TABLE_NAME'] = 'idempotency-table';

    // Default: event not yet processed
    mockIsAlreadyProcessed.mockResolvedValue(false);

    // Default: record processed succeeds
    mockRecordProcessed.mockResolvedValue(undefined);

    // Default: no dependents to evaluate
    mockEvaluateDependents.mockResolvedValue([]);

    // Default: no story/epic propagation changes
    mockPropagateToStory.mockResolvedValue(null);
    mockPropagateToEpic.mockResolvedValue(null);

    // Default: audit writing succeeds
    mockWriteAllAuditEvents.mockResolvedValue(0);
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  // =========================================================================
  // Environment Validation
  // =========================================================================

  describe('environment validation', () => {
    it('should throw when DATABASE_URL is not set', async () => {
      delete process.env['DATABASE_URL'];

      const { handler } = await import('../handler');
      const event = createSQSEvent([createSQSRecordFromEvent(createStatusChangeEvent())]);

      await expect(handler(event, createMockContext())).rejects.toThrow('DATABASE_URL is not set');
    });

    it('should throw when IDEMPOTENCY_TABLE_NAME is not set', async () => {
      delete process.env['IDEMPOTENCY_TABLE_NAME'];

      const { handler } = await import('../handler');
      const event = createSQSEvent([createSQSRecordFromEvent(createStatusChangeEvent())]);

      await expect(handler(event, createMockContext())).rejects.toThrow(
        'IDEMPOTENCY_TABLE_NAME is not set',
      );
    });
  });

  // =========================================================================
  // Batch Processing
  // =========================================================================

  describe('batch processing', () => {
    it('should process multiple events in a single SQS batch', async () => {
      const { handler } = await import('../handler');

      const event1 = createStatusChangeEvent({ eventId: 'evt-1', entityId: 'task-1' });
      const event2 = createStatusChangeEvent({ eventId: 'evt-2', entityId: 'task-2' });
      const event3 = createStatusChangeEvent({ eventId: 'evt-3', entityId: 'task-3' });

      const sqsEvent = createSQSEvent([
        createSQSRecordFromEvent(event1),
        createSQSRecordFromEvent(event2),
        createSQSRecordFromEvent(event3),
      ]);

      const result: SQSBatchResponse = await handler(sqsEvent, createMockContext());

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockIsAlreadyProcessed).toHaveBeenCalledTimes(3);
      expect(mockRecordProcessed).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed success and failure in a batch', async () => {
      const { handler } = await import('../handler');

      const event1 = createStatusChangeEvent({ eventId: 'evt-1' });
      const event2 = createStatusChangeEvent({ eventId: 'evt-2' });
      const event3 = createStatusChangeEvent({ eventId: 'evt-3' });

      // Second event causes an evaluator error
      let evaluateCallCount = 0;
      mockEvaluateDependents.mockImplementation(() => {
        evaluateCallCount++;
        if (evaluateCallCount === 2) {
          return Promise.reject(new Error('Database connection lost'));
        }
        return Promise.resolve([]);
      });

      const record1 = createSQSRecordFromEvent(event1, { messageId: 'msg-1' });
      const record2 = createSQSRecordFromEvent(event2, { messageId: 'msg-2' });
      const record3 = createSQSRecordFromEvent(event3, { messageId: 'msg-3' });

      const sqsEvent = createSQSEvent([record1, record2, record3]);

      const result: SQSBatchResponse = await handler(sqsEvent, createMockContext());

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0]?.itemIdentifier).toBe('msg-2');
    });

    it('should continue processing remaining messages after a failure', async () => {
      const { handler } = await import('../handler');

      const event1 = createStatusChangeEvent({ eventId: 'evt-1' });
      const event2 = createStatusChangeEvent({ eventId: 'evt-2' });
      const event3 = createStatusChangeEvent({ eventId: 'evt-3' });

      // First event causes an error
      let evaluateCallCount = 0;
      mockEvaluateDependents.mockImplementation(() => {
        evaluateCallCount++;
        if (evaluateCallCount === 1) {
          return Promise.reject(new Error('First record failed'));
        }
        return Promise.resolve([]);
      });

      const record1 = createSQSRecordFromEvent(event1, { messageId: 'msg-1' });
      const record2 = createSQSRecordFromEvent(event2, { messageId: 'msg-2' });
      const record3 = createSQSRecordFromEvent(event3, { messageId: 'msg-3' });

      const sqsEvent = createSQSEvent([record1, record2, record3]);

      const result: SQSBatchResponse = await handler(sqsEvent, createMockContext());

      // First failed, other two should succeed
      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0]?.itemIdentifier).toBe('msg-1');
      // Records 2 and 3 should still be processed
      expect(mockEvaluateDependents).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // Partial Batch Failure Response
  // =========================================================================

  describe('partial batch failure response', () => {
    it('should return empty batchItemFailures when all messages succeed', async () => {
      const { handler } = await import('../handler');

      const sqsEvent = createSQSEvent([
        createSQSRecordFromEvent(createStatusChangeEvent()),
        createSQSRecordFromEvent(createStatusChangeEvent()),
      ]);

      const result: SQSBatchResponse = await handler(sqsEvent, createMockContext());

      expect(result.batchItemFailures).toEqual([]);
    });

    it('should return failed message IDs in batchItemFailures', async () => {
      const { handler } = await import('../handler');

      // 5 messages, records 2 and 4 fail
      let evaluateCallCount = 0;
      mockEvaluateDependents.mockImplementation(() => {
        evaluateCallCount++;
        if (evaluateCallCount === 2 || evaluateCallCount === 4) {
          return Promise.reject(new Error('Simulated failure'));
        }
        return Promise.resolve([]);
      });

      const records = Array.from({ length: 5 }, (_, i) =>
        createSQSRecordFromEvent(createStatusChangeEvent({ eventId: `evt-${String(i + 1)}` }), {
          messageId: `msg-${String(i + 1)}`,
        }),
      );

      const sqsEvent = createSQSEvent(records);

      const result: SQSBatchResponse = await handler(sqsEvent, createMockContext());

      expect(result.batchItemFailures).toHaveLength(2);
      const failedIds = result.batchItemFailures.map((f) => f.itemIdentifier);
      expect(failedIds).toContain('msg-2');
      expect(failedIds).toContain('msg-4');
    });
  });

  // =========================================================================
  // Idempotency
  // =========================================================================

  describe('idempotency', () => {
    it('should skip processing for an already-processed eventId', async () => {
      const { handler } = await import('../handler');

      // GetItem finds existing record -- already processed
      mockIsAlreadyProcessed.mockResolvedValue(true);

      const event = createStatusChangeEvent({ eventId: 'evt-duplicate' });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      const result: SQSBatchResponse = await handler(sqsEvent, createMockContext());

      expect(result.batchItemFailures).toHaveLength(0);
      // Should not process the event
      expect(mockEvaluateDependents).not.toHaveBeenCalled();
      expect(mockPropagateToStory).not.toHaveBeenCalled();
      expect(mockPropagateToEpic).not.toHaveBeenCalled();
      expect(mockWriteAllAuditEvents).not.toHaveBeenCalled();
      // Should not record since it was already processed
      expect(mockRecordProcessed).not.toHaveBeenCalled();
    });

    it('should process a new eventId and record it after success', async () => {
      const { handler } = await import('../handler');

      mockIsAlreadyProcessed.mockResolvedValue(false);

      const event = createStatusChangeEvent({ eventId: 'evt-new' });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      const result: SQSBatchResponse = await handler(sqsEvent, createMockContext());

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockIsAlreadyProcessed).toHaveBeenCalledWith('evt-new', 'idempotency-table');
      expect(mockEvaluateDependents).toHaveBeenCalledTimes(1);
      // Record should be written AFTER successful processing
      expect(mockRecordProcessed).toHaveBeenCalledWith('evt-new', 'idempotency-table');
    });

    it('should be safe to process the same event twice', async () => {
      const { handler } = await import('../handler');

      const event = createStatusChangeEvent({ eventId: 'evt-reprocess' });
      const record = createSQSRecordFromEvent(event);

      // First time: not yet processed
      mockIsAlreadyProcessed.mockResolvedValueOnce(false);
      // Second time: already processed (recorded after first success)
      mockIsAlreadyProcessed.mockResolvedValueOnce(true);

      // First processing
      const result1: SQSBatchResponse = await handler(
        createSQSEvent([record]),
        createMockContext(),
      );

      // Second processing (same event)
      const result2: SQSBatchResponse = await handler(
        createSQSEvent([record]),
        createMockContext(),
      );

      expect(result1.batchItemFailures).toHaveLength(0);
      expect(result2.batchItemFailures).toHaveLength(0);
      // evaluateDependents should only be called once (first processing)
      expect(mockEvaluateDependents).toHaveBeenCalledTimes(1);
      // Record written only once (first processing)
      expect(mockRecordProcessed).toHaveBeenCalledTimes(1);
    });

    it('should report message as failed when idempotency check throws', async () => {
      const { handler } = await import('../handler');

      // Simulate DynamoDB throttling on the Get check
      mockIsAlreadyProcessed.mockRejectedValue(new Error('Provisioned throughput exceeded'));

      const event = createStatusChangeEvent({ eventId: 'evt-throttled' });
      const record = createSQSRecordFromEvent(event, { messageId: 'msg-throttled' });
      const sqsEvent = createSQSEvent([record]);

      const result: SQSBatchResponse = await handler(sqsEvent, createMockContext());

      // Message should be reported as failed so SQS retries it
      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0]?.itemIdentifier).toBe('msg-throttled');
      // Should not process the event
      expect(mockEvaluateDependents).not.toHaveBeenCalled();
    });

    it('should report message as failed when recordProcessed throws', async () => {
      const { handler } = await import('../handler');

      mockIsAlreadyProcessed.mockResolvedValue(false);
      // Simulate DynamoDB throttling on the Put record
      mockRecordProcessed.mockRejectedValue(new Error('Provisioned throughput exceeded'));

      const event = createStatusChangeEvent({ eventId: 'evt-record-fail' });
      const record = createSQSRecordFromEvent(event, { messageId: 'msg-record-fail' });
      const sqsEvent = createSQSEvent([record]);

      const result: SQSBatchResponse = await handler(sqsEvent, createMockContext());

      // Message should be reported as failed so SQS retries it
      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0]?.itemIdentifier).toBe('msg-record-fail');
      // Processing DID happen (evaluator was called)
      expect(mockEvaluateDependents).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Story-Level Propagation
  // =========================================================================

  describe('story-level propagation', () => {
    it('should propagate status to story when task completes', async () => {
      const { handler } = await import('../handler');

      const storyPropagation = createMockPropagation({
        entityId: 'story-1',
        entityType: 'story',
        previousStatus: 'in_progress',
        newStatus: 'done',
      });
      mockPropagateToStory.mockResolvedValue(storyPropagation);

      const event = createStatusChangeEvent({
        eventType: 'task.completed',
        entityId: 'task-1',
      });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      await handler(sqsEvent, createMockContext());

      expect(mockPropagateToStory).toHaveBeenCalledWith(
        expect.anything(), // db
        'task-1',
        'project-1',
        'tenant-1', // tenantId
        expect.anything(), // logger
      );
    });

    it('should mark story as complete when all tasks are done (via propagateToStory)', async () => {
      const { handler } = await import('../handler');

      const storyResult = createMockPropagation({
        entityId: 'story-complete',
        entityType: 'story',
        entityName: 'Complete Story',
        previousStatus: 'in_progress',
        newStatus: 'done',
      });
      mockPropagateToStory.mockResolvedValue(storyResult);

      const event = createStatusChangeEvent({
        eventType: 'task.completed',
        entityId: 'task-last',
      });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      const result: SQSBatchResponse = await handler(sqsEvent, createMockContext());

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockPropagateToStory).toHaveBeenCalledTimes(1);
    });

    it('should not change story status when tasks are still in progress', async () => {
      const { handler } = await import('../handler');

      // propagateToStory returns null when status hasn't changed
      mockPropagateToStory.mockResolvedValue(null);

      const event = createStatusChangeEvent({
        eventType: 'task.completed',
        entityId: 'task-partial',
      });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      await handler(sqsEvent, createMockContext());

      expect(mockPropagateToStory).toHaveBeenCalledTimes(1);
      // No epic propagation because story didn't change
      expect(mockPropagateToEpic).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Epic-Level Propagation
  // =========================================================================

  describe('epic-level propagation', () => {
    it('should propagate status to epic when story completes', async () => {
      const { handler } = await import('../handler');

      const storyResult = createMockPropagation({
        entityId: 'story-1',
        entityType: 'story',
        previousStatus: 'in_progress',
        newStatus: 'done',
      });
      const epicResult = createMockPropagation({
        entityId: 'epic-1',
        entityType: 'epic',
        entityName: 'Test Epic',
        previousStatus: 'in_progress',
        newStatus: 'done',
      });
      mockPropagateToStory.mockResolvedValue(storyResult);
      mockPropagateToEpic.mockResolvedValue(epicResult);

      const event = createStatusChangeEvent({
        eventType: 'task.completed',
        entityId: 'task-1',
      });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      await handler(sqsEvent, createMockContext());

      expect(mockPropagateToEpic).toHaveBeenCalledWith(
        expect.anything(), // db
        'story-1', // storyId from storyResult
        'project-1',
        'tenant-1', // tenantId
        expect.anything(), // logger
      );
    });

    it('should mark epic as complete when all stories are done', async () => {
      const { handler } = await import('../handler');

      const storyResult = createMockPropagation({
        entityId: 'story-1',
        entityType: 'story',
        newStatus: 'done',
      });
      const epicResult = createMockPropagation({
        entityId: 'epic-complete',
        entityType: 'epic',
        entityName: 'Complete Epic',
        previousStatus: 'in_progress',
        newStatus: 'done',
      });
      mockPropagateToStory.mockResolvedValue(storyResult);
      mockPropagateToEpic.mockResolvedValue(epicResult);

      const event = createStatusChangeEvent({
        eventType: 'task.completed',
        entityId: 'task-last',
      });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      const result: SQSBatchResponse = await handler(sqsEvent, createMockContext());

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockPropagateToEpic).toHaveBeenCalledTimes(1);
    });

    it('should not change epic status when stories are still in progress', async () => {
      const { handler } = await import('../handler');

      const storyResult = createMockPropagation({
        entityId: 'story-1',
        entityType: 'story',
        newStatus: 'done',
      });
      // Epic doesn't change
      mockPropagateToStory.mockResolvedValue(storyResult);
      mockPropagateToEpic.mockResolvedValue(null);

      const event = createStatusChangeEvent({
        eventType: 'task.completed',
        entityId: 'task-1',
      });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      await handler(sqsEvent, createMockContext());

      expect(mockPropagateToEpic).toHaveBeenCalledTimes(1);
    });

    it('should handle story.completed event type by propagating only to epic', async () => {
      const { handler } = await import('../handler');

      const epicResult = createMockPropagation({
        entityId: 'epic-1',
        entityType: 'epic',
        previousStatus: 'in_progress',
        newStatus: 'done',
      });
      mockPropagateToEpic.mockResolvedValue(epicResult);

      const event = createStatusChangeEvent({
        eventType: 'story.completed',
        entityId: 'story-1',
        entityType: 'story',
      });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      await handler(sqsEvent, createMockContext());

      // Should not evaluate dependents or propagate to story
      expect(mockEvaluateDependents).not.toHaveBeenCalled();
      expect(mockPropagateToStory).not.toHaveBeenCalled();
      // Should propagate to epic
      expect(mockPropagateToEpic).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Audit Logging
  // =========================================================================

  describe('audit logging', () => {
    it('should write audit events for task unblock transitions', async () => {
      const { handler } = await import('../handler');

      const evaluations: DependentEvaluation[] = [
        createMockEvaluation({ taskId: 'task-unblocked-1' }),
        createMockEvaluation({ taskId: 'task-unblocked-2' }),
      ];
      mockEvaluateDependents.mockResolvedValue(evaluations);
      mockWriteAllAuditEvents.mockResolvedValue(2);

      const event = createStatusChangeEvent({
        eventType: 'task.completed',
        entityId: 'task-trigger',
        tenantId: 'tenant-audit',
        projectId: 'project-audit',
      });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      await handler(sqsEvent, createMockContext());

      expect(mockWriteAllAuditEvents).toHaveBeenCalledTimes(1);
      expect(mockWriteAllAuditEvents).toHaveBeenCalledWith(
        evaluations,
        [], // no propagations (story/epic both returned null)
        'tenant-audit',
        'project-audit',
        'task-trigger',
        expect.anything(), // logger
      );
    });

    it('should write audit event when story status changes', async () => {
      const { handler } = await import('../handler');

      const storyPropagation = createMockPropagation({
        entityId: 'story-1',
        entityType: 'story',
        entityName: 'Test Story',
        previousStatus: 'in_progress',
        newStatus: 'done',
      });
      mockPropagateToStory.mockResolvedValue(storyPropagation);
      mockWriteAllAuditEvents.mockResolvedValue(1);

      const event = createStatusChangeEvent({
        eventType: 'task.completed',
        entityId: 'task-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
      });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      await handler(sqsEvent, createMockContext());

      expect(mockWriteAllAuditEvents).toHaveBeenCalledWith(
        [], // no task evaluations
        expect.arrayContaining([
          expect.objectContaining({
            entityId: 'story-1',
            entityType: 'story',
            previousStatus: 'in_progress',
            newStatus: 'done',
          }),
        ]),
        'tenant-1',
        'project-1',
        'task-1',
        expect.anything(),
      );
    });

    it('should write audit event when epic status changes', async () => {
      const { handler } = await import('../handler');

      const storyResult = createMockPropagation({
        entityId: 'story-1',
        entityType: 'story',
        newStatus: 'done',
      });
      const epicResult = createMockPropagation({
        entityId: 'epic-1',
        entityType: 'epic',
        entityName: 'Test Epic',
        previousStatus: 'in_progress',
        newStatus: 'done',
      });
      mockPropagateToStory.mockResolvedValue(storyResult);
      mockPropagateToEpic.mockResolvedValue(epicResult);
      mockWriteAllAuditEvents.mockResolvedValue(2);

      const event = createStatusChangeEvent({
        eventType: 'task.completed',
        entityId: 'task-1',
      });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      await handler(sqsEvent, createMockContext());

      expect(mockWriteAllAuditEvents).toHaveBeenCalledWith(
        [], // no task evaluations
        expect.arrayContaining([
          expect.objectContaining({ entityId: 'story-1', entityType: 'story' }),
          expect.objectContaining({ entityId: 'epic-1', entityType: 'epic' }),
        ]),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.anything(),
      );
    });

    it('should not write audit events when no transitions occurred', async () => {
      const { handler } = await import('../handler');

      // No evaluations, no propagations
      mockEvaluateDependents.mockResolvedValue([]);
      mockPropagateToStory.mockResolvedValue(null);

      const event = createStatusChangeEvent({ eventType: 'task.completed' });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      await handler(sqsEvent, createMockContext());

      expect(mockWriteAllAuditEvents).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Error Handling
  // =========================================================================

  describe('error handling', () => {
    it('should handle malformed SQS message body gracefully', async () => {
      const { handler } = await import('../handler');

      const malformedRecord = createSQSRecord({
        body: 'not-valid-json{{{',
        messageId: 'msg-malformed',
      });
      const validRecord = createSQSRecordFromEvent(
        createStatusChangeEvent({ eventId: 'evt-valid' }),
        { messageId: 'msg-valid' },
      );

      const sqsEvent = createSQSEvent([malformedRecord, validRecord]);

      const result: SQSBatchResponse = await handler(sqsEvent, createMockContext());

      // Malformed message reported as failed
      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0]?.itemIdentifier).toBe('msg-malformed');
      // Valid message was still processed (idempotency check was called for the valid one)
      expect(mockIsAlreadyProcessed).toHaveBeenCalledTimes(1);
    });

    it('should handle database errors gracefully', async () => {
      const { handler } = await import('../handler');

      mockEvaluateDependents.mockRejectedValue(new Error('Connection refused'));

      const record = createSQSRecordFromEvent(createStatusChangeEvent({ eventId: 'evt-db-fail' }), {
        messageId: 'msg-db-fail',
      });
      const sqsEvent = createSQSEvent([record]);

      const result: SQSBatchResponse = await handler(sqsEvent, createMockContext());

      // Message reported as failed for retry
      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0]?.itemIdentifier).toBe('msg-db-fail');
    });

    it('should log errors with message ID and error details', async () => {
      const { handler } = await import('../handler');

      mockEvaluateDependents.mockRejectedValue(new Error('Something broke'));

      const record = createSQSRecordFromEvent(createStatusChangeEvent(), {
        messageId: 'msg-err-log',
      });
      const sqsEvent = createSQSEvent([record]);

      await handler(sqsEvent, createMockContext());

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'msg-err-log',
          error: 'Something broke',
        }),
        'Failed to process status change event',
      );
    });
  });

  // =========================================================================
  // Task Failed Event Type
  // =========================================================================

  describe('task.failed event type', () => {
    it('should propagate failure upward to story and epic without evaluating dependents', async () => {
      const { handler } = await import('../handler');

      const storyResult = createMockPropagation({
        entityId: 'story-1',
        entityType: 'story',
        previousStatus: 'in_progress',
        newStatus: 'failed',
      });
      mockPropagateToStory.mockResolvedValue(storyResult);

      const epicResult = createMockPropagation({
        entityId: 'epic-1',
        entityType: 'epic',
        previousStatus: 'in_progress',
        newStatus: 'failed',
      });
      mockPropagateToEpic.mockResolvedValue(epicResult);
      mockWriteAllAuditEvents.mockResolvedValue(2);

      const event = createStatusChangeEvent({
        eventType: 'task.failed',
        entityId: 'task-failed',
        entityType: 'task',
        newStatus: 'failed',
      });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      await handler(sqsEvent, createMockContext());

      // Should NOT evaluate dependents for failed tasks
      expect(mockEvaluateDependents).not.toHaveBeenCalled();
      // Should propagate to story and epic
      expect(mockPropagateToStory).toHaveBeenCalledTimes(1);
      expect(mockPropagateToEpic).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Integration-Like Scenarios
  // =========================================================================

  describe('integration-like scenarios', () => {
    it('should process a complete flow: task completion -> unblock -> story update -> epic update -> audit', async () => {
      const { handler } = await import('../handler');

      // Task completion triggers 2 unblocks
      const evaluations: DependentEvaluation[] = [
        createMockEvaluation({ taskId: 'task-dep-1', taskName: 'Dep 1' }),
        createMockEvaluation({ taskId: 'task-dep-2', taskName: 'Dep 2' }),
      ];
      mockEvaluateDependents.mockResolvedValue(evaluations);

      // Story status changes
      const storyResult = createMockPropagation({
        entityId: 'story-1',
        entityType: 'story',
        previousStatus: 'in_progress',
        newStatus: 'done',
      });
      mockPropagateToStory.mockResolvedValue(storyResult);

      // Epic status changes
      const epicResult = createMockPropagation({
        entityId: 'epic-1',
        entityType: 'epic',
        previousStatus: 'in_progress',
        newStatus: 'done',
      });
      mockPropagateToEpic.mockResolvedValue(epicResult);

      mockWriteAllAuditEvents.mockResolvedValue(4);

      const event = createStatusChangeEvent({
        eventType: 'task.completed',
        entityId: 'task-trigger',
        projectId: 'project-1',
        tenantId: 'tenant-1',
      });
      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(event)]);

      const result: SQSBatchResponse = await handler(sqsEvent, createMockContext());

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockEvaluateDependents).toHaveBeenCalledTimes(1);
      expect(mockPropagateToStory).toHaveBeenCalledTimes(1);
      expect(mockPropagateToEpic).toHaveBeenCalledTimes(1);
      expect(mockWriteAllAuditEvents).toHaveBeenCalledWith(
        evaluations,
        [storyResult, epicResult],
        'tenant-1',
        'project-1',
        'task-trigger',
        expect.anything(),
      );
      expect(mockIsAlreadyProcessed).toHaveBeenCalledTimes(1);
      expect(mockRecordProcessed).toHaveBeenCalledTimes(1);
    });

    it('should create pool client with DATABASE_URL', async () => {
      const { handler } = await import('../handler');

      const sqsEvent = createSQSEvent([createSQSRecordFromEvent(createStatusChangeEvent())]);

      await handler(sqsEvent, createMockContext());

      expect(mockCreatePoolClient).toHaveBeenCalledWith('postgres://test:test@localhost:5432/test');
    });
  });
});
