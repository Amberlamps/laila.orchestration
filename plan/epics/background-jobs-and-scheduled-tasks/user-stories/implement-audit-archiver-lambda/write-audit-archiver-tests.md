# Write Audit Archiver Tests

## Task Details

- **Title:** Write Audit Archiver Tests
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Audit Archiver Lambda](./tasks.md)
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Dependencies:** Create Audit Archiver Handler

## Description

Write comprehensive unit tests for the audit archiver Lambda handler. Tests should cover S3 key partitioning, pagination handling, NDJSON format correctness, empty result handling, and large batch processing.

### Test Structure

```typescript
// functions/audit-archiver/src/__tests__/handler.test.ts
// Unit tests for the audit archiver Lambda handler.
// Uses vitest with mocked DynamoDB and S3 clients.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScheduledEvent, Context } from 'aws-lambda';

vi.mock('../dynamo');
vi.mock('../s3');

describe('audit-archiver handler', () => {
  describe('S3 key partitioning', () => {
    it('should partition events by year/month/day in S3 keys', async () => {
      // Setup: events from 2025-12-15 and 2025-12-16
      // Assert: two S3 objects created with keys:
      //   audit/2025/12/15/events-{ts}.ndjson
      //   audit/2025/12/16/events-{ts}.ndjson
    });

    it('should zero-pad month and day in S3 keys', async () => {
      // Setup: event from 2026-01-05
      // Assert: S3 key contains "01/05" not "1/5"
    });

    it('should use UTC date for partitioning to avoid timezone issues', async () => {
      // Setup: event at 2026-01-15T23:30:00Z (UTC) which is Jan 16 in some timezones
      // Assert: partitioned under 2026/01/15 (UTC date)
    });

    it('should handle events spanning multiple months', async () => {
      // Setup: events from Nov 2025 and Dec 2025
      // Assert: separate partitions for each month
    });
  });

  describe('NDJSON format', () => {
    it('should output one JSON object per line', async () => {
      // Setup: 3 events
      // Assert: S3 body contains exactly 3 lines, each valid JSON
    });

    it('should not include trailing newline', async () => {
      // Assert: NDJSON string does not end with "\n"
    });

    it('should handle events with special characters in metadata', async () => {
      // Setup: event with metadata containing newlines, quotes, unicode
      // Assert: JSON.stringify handles escaping correctly, one line per event
    });

    it('should preserve all event fields in the archived format', async () => {
      // Setup: event with all fields populated
      // Assert: deserialized NDJSON matches original event
    });
  });

  describe('pagination', () => {
    it('should handle paginated DynamoDB scan results', async () => {
      // Setup: DynamoDB returns 3 pages of results (LastEvaluatedKey)
      // Assert: all events from all pages are archived
    });

    it('should correctly accumulate events across pages', async () => {
      // Setup: 2500 events across 3 pages (1000, 1000, 500)
      // Assert: total eventsArchived = 2500
    });
  });

  describe('empty results', () => {
    it('should handle no events to archive gracefully', async () => {
      // Setup: DynamoDB scan returns zero items
      // Assert: returns { eventsArchived: 0, filesWritten: 0 }, no S3 uploads
    });

    it('should not create empty S3 objects', async () => {
      // Assert: S3 PutObject is never called when there are no events
    });
  });

  describe('large batch handling', () => {
    it('should process large numbers of events without memory issues', async () => {
      // Setup: 10,000 events (simulated via generator)
      // Assert: completes successfully, events are batched
    });

    it('should use streaming/generator pattern for DynamoDB scanning', async () => {
      // Assert: scanExpiredEvents yields batches, not all-at-once
    });
  });

  describe('S3 upload configuration', () => {
    it('should set Content-Type to application/x-ndjson', async () => {
      // Assert: PutObjectCommand includes ContentType: "application/x-ndjson"
    });

    it('should enable server-side encryption', async () => {
      // Assert: PutObjectCommand includes ServerSideEncryption: "AES256"
    });
  });

  describe('summary reporting', () => {
    it('should return accurate counts in ArchiveResult', async () => {
      // Setup: 150 events across 3 dates
      // Assert: { eventsArchived: 150, filesWritten: 3 }
    });

    it('should include all partition keys in the result', async () => {
      // Assert: partitions array lists all date partitions written
    });

    it('should report total size in bytes', async () => {
      // Assert: totalSizeBytes matches the sum of all uploaded NDJSON sizes
    });
  });
});
```

### Partition Function Tests

```typescript
// functions/audit-archiver/src/__tests__/partition.test.ts
// Unit tests for the date partitioning utility.

import { describe, it, expect } from 'vitest';
import { groupByDate } from '../partition';

describe('groupByDate', () => {
  it('should group events by their UTC date', async () => {
    // Setup: events with timestamps on different dates
    // Assert: grouped correctly by date key
  });

  it('should return an empty map for an empty array', async () => {
    // Assert: groupByDate([]) returns empty Map
  });

  it('should group all same-day events together', async () => {
    // Setup: 5 events all on the same day at different times
    // Assert: single group with all 5 events
  });
});
```

## Acceptance Criteria

- [ ] Tests exist at `functions/audit-archiver/src/__tests__/handler.test.ts`
- [ ] Tests exist at `functions/audit-archiver/src/__tests__/partition.test.ts`
- [ ] S3 key partitioning tests verify correct year/month/day format with zero-padding
- [ ] UTC date is used for partitioning (not local timezone)
- [ ] NDJSON format tests verify one JSON object per line
- [ ] Special characters in metadata are handled correctly in NDJSON
- [ ] Pagination tests verify all pages of DynamoDB results are processed
- [ ] Empty result tests verify no S3 uploads and graceful return
- [ ] Large batch tests verify memory-efficient processing
- [ ] S3 upload configuration tests verify encryption and Content-Type
- [ ] Summary reporting tests verify accurate counts and sizes
- [ ] All tests pass with `pnpm test`
- [ ] No `any` types are used in test code

## Technical Notes

- Mock the DynamoDB DocumentClient and S3 Client at the module level. Use `vi.fn()` with typed return values.
- For pagination tests, simulate `LastEvaluatedKey` behavior: return a key on the first two scan calls, return undefined on the third.
- The async generator (`scanExpiredEvents`) can be tested by consuming it with `for await...of` in the test.
- NDJSON format validation: split the output by `\n`, verify each line parses as valid JSON, and verify the total line count matches the event count.

## References

- **Test Framework:** vitest (https://vitest.dev/)
- **Handler Implementation:** [Create Audit Archiver Handler](./create-audit-archiver-handler.md)
- **NDJSON Specification:** https://github.com/ndjson/ndjson-spec

## Estimated Complexity

Medium — Pagination and NDJSON format testing require attention to detail, but the patterns are straightforward. The async generator testing adds slight complexity.
