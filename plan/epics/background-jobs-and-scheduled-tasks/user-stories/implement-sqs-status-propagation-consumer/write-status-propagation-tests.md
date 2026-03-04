# Write Status Propagation Tests

## Task Details

- **Title:** Write Status Propagation Tests
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement SQS Status Propagation Consumer](./tasks.md)
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Dependencies:** Create Status Propagation Handler

## Description

Write comprehensive unit tests for the SQS status propagation consumer. Tests should cover cascading unblock correctness, multi-message batch processing, DLQ retry behavior, idempotency guarantees, and upward status propagation to story and epic levels.

### Test Structure

```typescript
// functions/status-propagation/src/__tests__/handler.test.ts
// Unit tests for the SQS status propagation consumer.
// Uses vitest with mocked database, DynamoDB, and SQS types.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { handler } from '../handler';

vi.mock('../db');
vi.mock('../audit');
vi.mock('../idempotency');

// Helper to create a typed SQS record without using `any`
function createSQSRecord(overrides: Partial<SQSRecord> & { body: string }): SQSRecord {
  return {
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
    ...overrides,
  };
}

describe('status-propagation handler', () => {
  describe('cascading unblock', () => {
    it('should unblock a dependent task when all its dependencies are complete', async () => {
      // Setup: task A completes, task B depends only on A and is "blocked"
      // Event: { eventType: "task.completed", entityId: "task-a" }
      // Assert: task B transitions from "blocked" to "not_started"
    });

    it('should NOT unblock a dependent task when some dependencies are still incomplete', async () => {
      // Setup: task C depends on A and B. A completes, B is still "in_progress"
      // Event: { eventType: "task.completed", entityId: "task-a" }
      // Assert: task C remains "blocked"
    });

    it('should unblock multiple dependent tasks from a single completion', async () => {
      // Setup: task A completes. Tasks B, C, and D all depend only on A
      // Assert: B, C, and D all transition from "blocked" to "not_started"
    });

    it('should not unblock tasks that are already not_started', async () => {
      // Setup: task B depends on A, but B is already "not_started"
      // Event: task A completes
      // Assert: B remains "not_started" (no duplicate transition)
    });

    it('should handle diamond dependencies correctly', async () => {
      // Setup: A -> B, A -> C, B -> D, C -> D (diamond pattern)
      // Event: A completes, B and C are unblocked
      // Assert: D remains "blocked" (B and C are not yet complete)
    });
  });

  describe('batch processing', () => {
    it('should process multiple events in a single SQS batch', async () => {
      // Setup: SQSEvent with 3 records (3 different task completions)
      // Assert: all 3 events processed, no batch failures returned
    });

    it('should handle mixed success and failure in a batch', async () => {
      // Setup: SQSEvent with 3 records, second one throws an error
      // Assert: batchItemFailures contains only the second record's messageId
    });

    it('should continue processing remaining messages after a failure', async () => {
      // Setup: SQSEvent with 3 records, first one fails
      // Assert: records 2 and 3 are still processed successfully
    });
  });

  describe('partial batch failure response', () => {
    it('should return empty batchItemFailures when all messages succeed', async () => {
      // Assert: response.batchItemFailures is an empty array
    });

    it('should return failed message IDs in batchItemFailures', async () => {
      // Setup: 2 out of 5 messages fail
      // Assert: batchItemFailures contains exactly 2 entries with correct messageIds
    });
  });

  describe('idempotency', () => {
    it('should skip processing for an already-processed eventId', async () => {
      // Setup: checkIdempotency returns true for the eventId
      // Assert: no status transitions occur, no audit events written
    });

    it('should process a new eventId and record it as processed', async () => {
      // Setup: checkIdempotency returns false
      // Assert: event is processed, recordProcessed is called
    });

    it('should be safe to process the same event twice', async () => {
      // Setup: process the same event twice (second time idempotency check returns true)
      // Assert: database state is identical after both processing attempts
    });
  });

  describe('story-level propagation', () => {
    it('should mark story as complete when all tasks are complete', async () => {
      // Setup: story has 3 tasks, first 2 already complete, third just completed
      // Assert: story status transitions to "complete"
    });

    it('should not change story status when tasks are still in progress', async () => {
      // Setup: story has 3 tasks, 1 complete, 1 in_progress, 1 not_started
      // Assert: story status remains "in_progress"
    });
  });

  describe('epic-level propagation', () => {
    it('should mark epic as complete when all stories are complete', async () => {
      // Setup: epic has 2 stories, both now complete
      // Assert: epic status transitions to "complete"
    });

    it('should not change epic status when stories are still in progress', async () => {
      // Setup: epic has 3 stories, 1 complete, 2 in_progress
      // Assert: epic remains "in_progress"
    });
  });

  describe('audit logging', () => {
    it('should write audit events for each status transition', async () => {
      // Setup: task completion unblocks 2 dependent tasks
      // Assert: 2 audit events written (one per transition)
    });

    it('should write audit event when story status changes', async () => {
      // Assert: audit event includes story entity and before/after status
    });

    it('should write audit event when epic status changes', async () => {
      // Assert: audit event includes epic entity and before/after status
    });
  });

  describe('error handling', () => {
    it('should handle malformed SQS message body gracefully', async () => {
      // Setup: SQS record with invalid JSON body
      // Assert: message reported as failed, other messages still processed
    });

    it('should handle database errors gracefully', async () => {
      // Setup: database query throws connection error
      // Assert: message reported as failed for retry
    });
  });
});
```

### Evaluator Tests

```typescript
// functions/status-propagation/src/__tests__/evaluator.test.ts
// Unit tests for the dependency evaluation logic.

import { describe, it, expect, vi } from 'vitest';
import { evaluateDependents } from '../evaluator';

vi.mock('../db');

describe('evaluateDependents', () => {
  it('should find all tasks depending on the completed task', async () => {
    // Assert: correct reverse dependency lookup
  });

  it('should check ALL dependencies of each dependent task, not just the triggering one', async () => {
    // Setup: dependent task has 3 dependencies, only 1 just completed
    // Assert: checks all 3 dependencies before deciding to unblock
  });

  it('should return empty array when no tasks depend on the completed task', async () => {
    // Assert: no transitions when there are no dependents
  });
});
```

## Acceptance Criteria

- [ ] Tests exist at `functions/status-propagation/src/__tests__/handler.test.ts`
- [ ] Tests exist at `functions/status-propagation/src/__tests__/evaluator.test.ts`
- [ ] Cascading unblock correctness is tested for single, multiple, and diamond dependencies
- [ ] Batch processing tests verify all messages are processed independently
- [ ] Partial batch failure response correctly reports failed message IDs
- [ ] Idempotency tests verify duplicate events are safely skipped
- [ ] Story-level propagation tests verify task-to-story status aggregation
- [ ] Epic-level propagation tests verify story-to-epic status aggregation
- [ ] Audit events are verified for each status transition
- [ ] Error handling tests verify graceful degradation with malformed messages
- [ ] All tests pass with `pnpm test`
- [ ] No `any` types are used in test code — typed SQS record helpers are used instead
- [ ] Mocks are properly typed with correct return value types

## Technical Notes

- Use the `createSQSRecord` helper to build typed SQS records without `any` casts. This satisfies the project requirement of no `any` types in tests.
- The diamond dependency pattern test is critical: it verifies that the consumer correctly evaluates ALL dependencies, not just the one that triggered the event.
- Partial batch failure is a Lambda-SQS integration feature that must be tested carefully. The handler must return `batchItemFailures` with the correct `messageId` for each failed record.
- Idempotency testing should verify both the "skip" path (already processed) and the "record" path (new event). The mock for `checkIdempotency` controls which path is taken.

## References

- **Test Framework:** vitest (https://vitest.dev/)
- **Handler Implementation:** [Create Status Propagation Handler](./create-status-propagation-handler.md)
- **SQS Partial Batch Response:** https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#services-sqs-batchfailurereporting
- **DAG Model:** Section 5 of the Design Specification

## Estimated Complexity

High — The cascading nature of status propagation creates many test scenarios. Diamond dependencies, partial batch failures, and idempotency each add significant test complexity. The typed SQS record construction requires careful attention to satisfy the no-`any` requirement.
