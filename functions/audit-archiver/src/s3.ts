/**
 * S3 upload functions for storing archived audit events.
 * Events are stored as newline-delimited JSON (NDJSON) files,
 * partitioned by year/month/day for efficient Athena querying.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import type { AuditEvent } from './dynamo';

const s3Client = new S3Client({});

/** Parameters for uploading an archive partition to S3. */
interface UploadArchiveParams {
  bucketName: string;
  events: AuditEvent[];
  partitionDate: { year: string; month: string; day: string };
  batchTimestamp: number;
}

/** Result of a successful S3 upload. */
interface UploadResult {
  key: string;
  sizeBytes: number;
}

/**
 * Upload a batch of audit events to S3 as NDJSON.
 *
 * S3 key format: audit/{year}/{month}/{day}/events-{timestamp}.ndjson
 * Example: audit/2026/01/15/events-1737936000000.ndjson
 *
 * NDJSON format: each line is a complete JSON object, no trailing comma.
 * This format is compatible with AWS Athena, Spark, and other big data tools.
 *
 * Objects are encrypted at rest using SSE-S3 (AES256).
 *
 * @param params - Upload parameters including bucket, events, partition date, and timestamp
 * @returns The S3 key and size in bytes of the uploaded object
 */
export async function uploadArchive(params: UploadArchiveParams): Promise<UploadResult> {
  const { bucketName, events, partitionDate, batchTimestamp } = params;

  const ndjson = events.map((event) => JSON.stringify(event)).join('\n');
  const body = Buffer.from(ndjson, 'utf-8');

  const key = `audit/${partitionDate.year}/${partitionDate.month}/${partitionDate.day}/events-${String(batchTimestamp)}.ndjson`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: 'application/x-ndjson',
      ServerSideEncryption: 'AES256',
    }),
  );

  return { key, sizeBytes: body.byteLength };
}
