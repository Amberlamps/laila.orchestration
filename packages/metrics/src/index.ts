/**
 * Custom CloudWatch metrics client for business-level monitoring.
 * Provides a typed, batched interface for publishing custom metrics
 * from Lambda functions.
 *
 * Metrics are buffered in memory during the Lambda invocation and
 * flushed once at the end via flushMetrics(). Each PutMetricData
 * call supports up to 1000 metric values, and the flush function
 * automatically splits into multiple API calls when needed.
 *
 * Custom namespace: "laila-works"
 */

import {
  CloudWatchClient,
  PutMetricDataCommand,
  type MetricDatum,
} from '@aws-sdk/client-cloudwatch';

const client = new CloudWatchClient({});
const NAMESPACE = 'laila-works';
const MAX_METRICS_PER_CALL = 1000;

/**
 * Metric buffer for batching PutMetricData calls.
 * CloudWatch supports up to 1000 metric values per PutMetricData call.
 * We buffer metrics and flush at the end of each Lambda invocation.
 */
const metricBuffer: MetricDatum[] = [];

/**
 * Build a MetricDatum from common parameters.
 * Handles the conditional inclusion of Dimensions to satisfy
 * exactOptionalPropertyTypes (we never assign undefined to an optional field).
 */
const buildDatum = (
  metricName: string,
  value: number,
  unit: 'Count' | 'Milliseconds' | 'Bytes',
  dimensions: Record<string, string> | undefined,
): MetricDatum => {
  const datum: MetricDatum = {
    MetricName: metricName,
    Value: value,
    Unit: unit,
    Timestamp: new Date(),
  };

  if (dimensions) {
    datum.Dimensions = Object.entries(dimensions).map(([Name, Value]) => ({
      Name,
      Value,
    }));
  }

  return datum;
};

/**
 * Record a count metric.
 * Accumulates in buffer and is flushed at the end of the Lambda invocation.
 */
export const recordCount = (
  metricName: string,
  value: number,
  dimensions?: Record<string, string>,
): void => {
  metricBuffer.push(buildDatum(metricName, value, 'Count', dimensions));
};

/**
 * Record a duration metric in milliseconds.
 */
export const recordDuration = (
  metricName: string,
  durationMs: number,
  dimensions?: Record<string, string>,
): void => {
  metricBuffer.push(buildDatum(metricName, durationMs, 'Milliseconds', dimensions));
};

/**
 * Record a size metric in bytes.
 */
export const recordBytes = (
  metricName: string,
  bytes: number,
  dimensions?: Record<string, string>,
): void => {
  metricBuffer.push(buildDatum(metricName, bytes, 'Bytes', dimensions));
};

/**
 * Flush all buffered metrics to CloudWatch.
 * Called at the end of each Lambda invocation.
 * Batches metrics into groups of 1000 (CloudWatch API limit).
 */
export const flushMetrics = async (): Promise<void> => {
  if (metricBuffer.length === 0) {
    return;
  }

  const batches: MetricDatum[][] = [];
  for (let i = 0; i < metricBuffer.length; i += MAX_METRICS_PER_CALL) {
    batches.push(metricBuffer.slice(i, i + MAX_METRICS_PER_CALL));
  }

  await Promise.all(
    batches.map((batch) =>
      client.send(
        new PutMetricDataCommand({
          Namespace: NAMESPACE,
          MetricData: batch,
        }),
      ),
    ),
  );

  // Clear the buffer after successful flush
  metricBuffer.length = 0;
};
