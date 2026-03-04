/**
 * Lambda handler for the audit archiver background job.
 *
 * Invoked by EventBridge Scheduler once per day (02:00 UTC).
 * Exports audit events older than 90 days from DynamoDB to S3
 * as newline-delimited JSON, partitioned by year/month/day.
 *
 * Flow:
 * 1. Calculate the cutoff timestamp: now - 90 days
 * 2. Scan DynamoDB for audit events with timestamp < cutoff
 *    (uses paginated scan with FilterExpression)
 * 3. Group events by date (year/month/day) for S3 partitioning
 * 4. For each date partition:
 *    a. Serialize events as NDJSON (one JSON object per line)
 *    b. Upload to S3: audit/YYYY/MM/DD/events-{timestamp}.ndjson
 * 5. Return summary: events archived, files written, total size
 */

import { recordCount, recordBytes, flushMetrics } from '@laila/metrics';

import { scanExpiredEvents } from './dynamo';
import { createInvocationLogger } from './logger';
import { groupByDate } from './partition';
import { uploadArchive } from './s3';

import type { ScheduledEvent, Context } from 'aws-lambda';

/** The number of days before an audit event is eligible for archival. */
const RETENTION_DAYS = 90;

/** The number of milliseconds in a single day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Summary returned by the handler after archival completes. */
export interface ArchiveResult {
  eventsArchived: number;
  filesWritten: number;
  totalSizeBytes: number;
  partitions: string[];
}

export const handler = async (event: ScheduledEvent, context: Context): Promise<ArchiveResult> => {
  const log = createInvocationLogger(context.awsRequestId);

  log.info(
    {
      time: event.time,
      resources: event.resources,
    },
    'Audit archiver invoked',
  );

  const tableName = process.env['TABLE_NAME'];
  if (!tableName) {
    log.error('TABLE_NAME is not set');
    throw new Error('TABLE_NAME is not set');
  }

  const bucketName = process.env['BUCKET_NAME'];
  if (!bucketName) {
    log.error('BUCKET_NAME is not set');
    throw new Error('BUCKET_NAME is not set');
  }

  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY);
  const cutoffTimestamp = cutoffDate.toISOString();

  log.info({ cutoffTimestamp, retentionDays: RETENTION_DAYS }, 'Scanning for expired audit events');

  let eventsArchived = 0;
  let filesWritten = 0;
  let totalSizeBytes = 0;
  const partitions: string[] = [];
  const batchTimestamp = Date.now();

  for await (const batch of scanExpiredEvents(cutoffTimestamp, tableName)) {
    log.debug({ batchSize: batch.length }, 'Processing batch of expired events');

    const dateGroups = groupByDate(batch);

    for (const [dateKey, events] of dateGroups) {
      const [year, month, day] = dateKey.split('/');

      if (!year || !month || !day) {
        log.warn({ dateKey }, 'Skipping invalid date partition key');
        continue;
      }

      const result = await uploadArchive({
        bucketName,
        events,
        partitionDate: { year, month, day },
        batchTimestamp,
      });

      log.info(
        {
          key: result.key,
          sizeBytes: result.sizeBytes,
          eventCount: events.length,
        },
        'Uploaded archive partition',
      );

      eventsArchived += events.length;
      filesWritten += 1;
      totalSizeBytes += result.sizeBytes;

      if (!partitions.includes(dateKey)) {
        partitions.push(dateKey);
      }
    }
  }

  if (eventsArchived === 0) {
    log.info('No expired audit events found; nothing to archive');
  } else {
    log.info(
      {
        eventsArchived,
        filesWritten,
        totalSizeBytes,
        partitionCount: partitions.length,
      },
      'Audit archiver completed',
    );
  }

  // Publish custom CloudWatch metrics
  recordCount('EventsArchived', eventsArchived);
  recordBytes('ArchiveSize', totalSizeBytes);
  recordCount('ArchivePartitions', partitions.length);
  await flushMetrics();

  return {
    eventsArchived,
    filesWritten,
    totalSizeBytes,
    partitions,
  };
};
